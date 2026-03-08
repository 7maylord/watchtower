# Watchtower CRE Workflows

Off-chain automation workflows built on the **Chainlink Compute Runtime Environment (CRE)** that power Watchtower's real-time risk monitoring, compliance screening, reserve verification, and AI-driven rebalancing.

## Overview

These workflows form the off-chain intelligence layer of Watchtower. Each workflow runs autonomously on the Chainlink decentralized oracle network, reads on-chain state from smart contracts, processes data through external APIs (Gemini AI, Chainalysis, Pinata IPFS), and writes results back on-chain — creating a continuous feedback loop between off-chain computation and on-chain enforcement.

## How CRE Integrates with the Smart Contracts

The Chainlink CRE is the bridge between Watchtower's off-chain intelligence and its on-chain enforcement. Here's how the two layers work together:

### The Integration Pattern

```
┌──────────────────────────────────────────────────────────┐
│                   SMART CONTRACTS (On-Chain)              │
│                                                          │
│  FundVault ──── emits events ────► CRE Trigger           │
│       │                                                  │
│       ├── checks ──► ComplianceRegistry                  │
│       ├── checks ──► RiskOracle                          │
│       └── checks ──► ProofOfReserveOracle                │
│                          ▲   ▲   ▲                       │
└──────────────────────────┼───┼───┼───────────────────────┘
                           │   │   │
                    writes │   │   │ writes
                           │   │   │
┌──────────────────────────┼───┼───┼───────────────────────┐
│                   CRE WORKFLOWS (Off-Chain)               │
│                           │   │   │                       │
│  Compliance Workflow ─────┘   │   │                       │
│  Portfolio Health Workflow ───┘   │                       │
│  Proof of Reserve Workflow ──────┘                        │
│  Rebalancing Advisor Workflow                             │
│       │                                                   │
│       └── reads on-chain state, calls external APIs,      │
│           computes results, writes back to contracts      │
└──────────────────────────────────────────────────────────┘
```

### Step-by-Step Data Flow

1. **Event Trigger** — Smart contracts emit events (e.g., `AnalysisRequested`, `ComplianceScreeningRequested`) that CRE workflows listen for via `EVMClient.logTrigger()`.

2. **On-Chain Read** — Workflows read current contract state using `EVMClient.callContract()` at `LAST_FINALIZED_BLOCK_NUMBER`:
   - `FundVault.totalAssets()` — portfolio size
   - `RiskOracle.getCurrentRiskScore()` — current risk level
   - `ComplianceRegistry.getComplianceStatus(address)` — KYC/sanctions status
   - `ProofOfReserveOracle.getCurrentReserves()` — reserve data

3. **Off-Chain Computation** — Workflows call external services:
   - **Gemini AI** for risk analysis and rebalancing recommendations
   - **Chainalysis** for AML/sanctions screening
   - **Pinata/IPFS** for decentralized report storage
   - **Firebase** for queryable report archival

4. **On-Chain Write** — Results are written back to oracle contracts using CRE's signed report mechanism:

   ```
   encodeFunctionData() → runtime.report() → evmClient.writeReport()
   ```

   The CRE network signs the payload with ECDSA, hashes with keccak256, and submits the transaction with consensus verification.

5. **On-Chain Enforcement** — FundVault reads the updated oracle values on every user interaction:
   - **Deposits blocked** if `RiskOracle` score ≥ 85
   - **Transfers blocked** if `ComplianceRegistry` flags sanctions
   - **Operations blocked** if `ProofOfReserveOracle` shows under-collateralization

### Role-Based Access

CRE workflows authenticate to smart contracts via the `CRE_WORKFLOW_ROLE` (an OpenZeppelin `AccessControl` role). This ensures only authorized Chainlink nodes can update oracle values — no manual intervention, no single point of failure.

### Multi-Chain Synchronization

Every workflow updates contracts on **all configured chains** (Sepolia + Base Sepolia) in a single execution cycle, keeping oracle state consistent across the multi-chain deployment.

## Workflows

### 1. Portfolio Health Monitor

**File:** `portfolio-health-workflow/main.ts`
**Schedule:** Every 15 minutes

Monitors vault health across all chains and updates on-chain risk scores using AI analysis.

| Step    | Action                                        | Target       |
| ------- | --------------------------------------------- | ------------ |
| Read    | `FundVault.totalAssets()`                     | All chains   |
| Read    | `RiskOracle.getCurrentRiskScore()`            | All chains   |
| Compute | Weighted average risk score by TVL            | In-workflow  |
| Analyze | Gemini AI risk assessment                     | External API |
| Store   | Upload risk report                            | Firebase     |
| Write   | `RiskOracle.updateRiskScore(score, ipfsHash)` | All chains   |

Only updates on-chain if the score change exceeds the `updateThreshold` (default: 5 points).

### 2. Compliance Screening

**File:** `compliance-screening-workflow/main.ts`
**Schedule:** Every 6 hours

Screens investor addresses against sanctions lists and updates the on-chain compliance registry.

| Step     | Action                                                       | Target       |
| -------- | ------------------------------------------------------------ | ------------ |
| Read     | `ComplianceRegistry.getComplianceStatus(addr)`               | All chains   |
| Screen   | Chainalysis KYT API (register + risk + sanctions)            | External API |
| Evaluate | Approved if not sanctioned AND riskScore < 50                | In-workflow  |
| Store    | Upload compliance report                                     | Firebase     |
| Write    | `ComplianceRegistry.updateCompliance(addr, kyc, sanctioned)` | All chains   |

Risk scoring uses weighted categories: sanctions (100), ransomware (95), stolen funds (90), darknet (80), scam (70).

### 3. Proof of Reserve

**File:** `proof-of-reserve-workflow/main.ts`
**Schedule:** Every 4 hours

Verifies that vault reserves match reported assets and updates the on-chain reserve oracle.

| Step      | Action                                                | Target      |
| --------- | ----------------------------------------------------- | ----------- |
| Read      | `FundVault.totalAssets()`                             | All chains  |
| Read      | `IERC20.balanceOf(vaultAddress)` (actual USDC)        | All chains  |
| Calculate | Reserve ratio = (balance / totalAssets) \* 10,000 bps | In-workflow |
| Read      | `ProofOfReserveOracle.getCurrentReserves()`           | All chains  |
| Store     | Upload attestation report                             | Firebase    |
| Write     | `ProofOfReserveOracle.updateReserves(reserves, hash)` | All chains  |

Only updates if the reserve change exceeds 1,000,000 units (~$1 USDC).

### 4. Rebalancing Advisor

**File:** `rebalancing-advisor-workflow/main.ts`
**Schedule:** Daily at midnight

Generates AI-powered rebalancing recommendations based on portfolio composition and risk levels.

| Step             | Action                                                     | Target        |
| ---------------- | ---------------------------------------------------------- | ------------- |
| Read             | `FundVault.totalAssets()`, `totalSupply()`, `sharePrice()` | Primary chain |
| Read             | `RiskOracle.getCurrentRiskScore()`                         | Primary chain |
| Check            | Portfolio ≥ minSize (10,000 USDC) AND risk ≥ minScore (50) | In-workflow   |
| Analyze          | Gemini AI rebalancing strategy                             | External API  |
| Store            | Upload advisory report                                     | Firebase      |
| Write (optional) | `FundVault.rebalance(hash, allocations...)`                | All chains    |

Returns a HOLD recommendation if the portfolio doesn't meet minimum thresholds.

## Project Structure

```
cre-workflow/
├── portfolio-health-workflow/
│   ├── main.ts                    # Workflow entry point
│   ├── workflow.yaml              # CRE workflow metadata
│   └── config.staging.json        # Chain addresses & thresholds
├── compliance-screening-workflow/
│   ├── main.ts
│   ├── workflow.yaml
│   └── config.staging.json
├── proof-of-reserve-workflow/
│   ├── main.ts
│   ├── workflow.yaml
│   └── config.staging.json
├── rebalancing-advisor-workflow/
│   ├── main.ts
│   ├── workflow.yaml
│   └── config.staging.json
├── shared/
│   ├── utils.ts                   # HTTP client, logging, error handling
│   ├── gemini.ts                  # Google Gemini AI integration
│   ├── chainalysis.ts             # Chainalysis KYT sanctions screening
│   ├── pinata.ts                  # IPFS upload via Pinata
│   └── firebase.ts                # Firestore report storage
├── contracts/
│   └── abi/index.ts               # Smart contract ABI exports
├── project.yaml                   # CRE CLI targets & RPC config
├── secrets.yaml                   # API keys (gitignored)
├── .env.example                   # Environment template
└── LOCAL_DEVELOPMENT.md           # Setup guide
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Chainlink CRE CLI
- API keys: Gemini, Chainalysis, Pinata

### Setup

```bash
cd cre-workflow
cp .env.example .env
# Fill in your API keys
```

See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for detailed instructions.

## Configuration

### Environment Variables

```bash
CRE_ETH_PRIVATE_KEY=       # Sepolia deployer key
CHAINALYSIS_API_KEY=        # KYT sanctions screening
GEMINI_API_KEY=             # AI risk analysis
PINATA_API_KEY=             # IPFS report storage
PINATA_API_SECRET=          # IPFS authentication
```

### Chain Configuration

Each workflow's `config.staging.json` specifies contract addresses per chain:

```json
{
  "schedule": "*/15 * * * *",
  "evms": [
    {
      "chainName": "ethereum-testnet-sepolia",
      "fundVaultAddress": "0x27b2...6ED2",
      "riskOracleAddress": "0x1723...28A7",
      "gasLimit": "5000000"
    },
    {
      "chainName": "ethereum-testnet-sepolia-base-1",
      "fundVaultAddress": "0x7857...858D",
      "riskOracleAddress": "0xe476...cf4B",
      "gasLimit": "5000000"
    }
  ]
}
```

## External Services

| Service                       | Purpose                                    | Used By                               |
| ----------------------------- | ------------------------------------------ | ------------------------------------- |
| **Google Gemini** (2.5 Flash) | AI risk analysis & rebalancing advice      | Portfolio Health, Rebalancing Advisor |
| **Chainalysis KYT**           | Sanctions & AML screening                  | Compliance Screening                  |
| **Pinata (IPFS)**             | Decentralized report storage               | All workflows                         |
| **Firebase Firestore**        | Queryable report archival for the frontend | All workflows                         |

## Related

- [Main Project README](../README.md)
- [Smart Contracts](../smart-contracts/README.md)
- [Frontend Dashboard](../frontend/README.md)
