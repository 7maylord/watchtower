# Watchtower Smart Contracts

Institutional-grade smart contracts for the Watchtower DeFi Vault Guardian system.

## 🏗️ Architecture

This directory contains four core contracts that work together to create a compliance-aware, AI-monitored tokenized fund:

### Core Contracts

#### 1. **ComplianceRegistry** (`src/core/ComplianceRegistry.sol`)

- Tracks KYC/AML status for all investors
- Maintains sanctions screening results
- Supports batch updates from CRE compliance workflow
- Role-based access: `COMPLIANCE_OFFICER_ROLE` and `CRE_WORKFLOW_ROLE`

#### 2. **RiskOracle** (`src/core/RiskOracle.sol`)

- Stores AI-generated risk scores (0-100)
- Monitors protocol health (Aave, Compound, etc.)
- Triggers auto-liquidation when risk ≥ 85
- Updated by CRE portfolio health workflow every 5 minutes

#### 3. **ProofOfReserveOracle** (`src/core/ProofOfReserveOracle.sol`)

- Verifies fund reserves using Chainlink PoR feeds
- Cross-checks with custodian API data
- Calculates reserve ratio in basis points
- Activates safeguards if reserves insufficient

#### 4. **FundVault** (`src/core/FundVault.sol`)

- Main ERC20 tokenized fund shares
- Integrates all three oracles for comprehensive checks
- Compliance-gated deposits, withdrawals, and transfers
- Risk-aware operations (blocks deposits if risk > 85)
- Reserve-aware (blocks operations if under-collateralized)
- **CCIP-native token** — registered as a Chainlink CCIP burn/mint token for cross-chain share transfers
- `bridgeShares()` sends shares cross-chain via CCIP Router
- `getBridgeFee()` estimates bridge costs for the frontend

### Contract Dependencies

```mermaid
graph TD
    FundVault[FundVault<br/>ERC20 Fund Shares]
    Compliance[ComplianceRegistry<br/>KYC/Sanctions]
    Risk[RiskOracle<br/>AI Risk Scores]
    PoR[ProofOfReserveOracle<br/>Reserve Verification]

    FundVault -->|checks compliance| Compliance
    FundVault -->|checks risk| Risk
    FundVault -->|checks reserves| PoR

    CRECompliance[CRE Compliance Workflow] -->|updates| Compliance
    CREPortfolio[CRE Portfolio Health Workflow] -->|updates| Risk
    CREPoR[CRE PoR Workflow] -->|updates| PoR
```

## 📁 File Structure

```
src/
├── core/
│   ├── ComplianceRegistry.sol      # KYC/sanctions tracking
│   ├── RiskOracle.sol              # AI risk monitoring
│   ├── ProofOfReserveOracle.sol    # Reserve verification
│   └── FundVault.sol               # Main fund contract (CCIP-enabled)
├── interfaces/
│   ├── IComplianceRegistry.sol
│   ├── IRiskOracle.sol
│   ├── IProofOfReserveOracle.sol
│   ├── IFundVault.sol
│   └── IReceiverContracts.sol      # CRE receiver interface
├── mock/
│   ├── MockUSDC.sol                # Testing token (6 decimals)
│   ├── MockAavePool.sol            # Mock Aave lending pool
│   └── MockCompoundReserve.sol     # Mock Compound reserve
script/
├── DeployWatchtower.s.sol          # Full deployment script
└── RegisterFundVaultCCIP.s.sol     # CCIP registration (pool + admin + remote config)
```

## 🚀 Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Sepolia testnet RPC URL
- Private key with Sepolia ETH

### Installation

```bash
# Install dependencies
forge install

# Compile contracts
forge build

# Run tests (Phase 3)
forge test

# Deploy to Sepolia
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

## 🔑 Access Control

Each contract implements role-based access control:

| Contract                 | Role                      | Purpose                    |
| ------------------------ | ------------------------- | -------------------------- |
| **ComplianceRegistry**   | `COMPLIANCE_OFFICER_ROLE` | Manual compliance updates  |
|                          | `CRE_WORKFLOW_ROLE`       | Batch updates from CRE     |
| **RiskOracle**           | `CRE_WORKFLOW_ROLE`       | Update risk scores         |
| **ProofOfReserveOracle** | `CRE_WORKFLOW_ROLE`       | Update reserve data        |
| **FundVault**            | `FUND_MANAGER_ROLE`       | Rebalancing, bridge shares |
|                          | `CRE_WORKFLOW_ROLE`       | Update total assets, bridge|
|                          | `MINTER_ROLE`             | Mint shares (CCIP pool)    |
|                          | `BURNER_ROLE`             | Burn shares (CCIP pool)    |
| **All**                  | `DEFAULT_ADMIN_ROLE`      | Pause/unpause, grant roles |

## 💡 Key Features

### Compliance Integration

Every transfer in `FundVault` checks:

- ✅ Sender has completed KYC
- ✅ Sender is not sanctioned
- ✅ Recipient has completed KYC
- ✅ Recipient is not sanctioned

### Risk-Aware Operations

- Deposits blocked when risk score ≥ 85
- Rebalancing blocked when risk score ≥ 90
- Auto-liquidation event triggered at threshold

### Reserve Safeguards

- Deposits blocked if reserves insufficient
- Reserve ratio must be ≥ 95% (configurable)
- Cross-verification between Chainlink PoR and custodian APIs

## 🧪 Testing

Tests will be added in Phase 3:

- Unit tests for each contract
- Integration tests for cross-contract interactions
- Fuzz testing for edge cases
- Gas optimization tests

## 📝 License

MIT License - see LICENSE file for details

## 🔗 Related Documentation

- [Main Project README](../README.md)
- [CRE Workflows](../cre-workflow/README.md)
- [Frontend Dashboard](../frontend/README.md)
