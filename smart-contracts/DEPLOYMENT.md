# Deployment Guide

This guide explains how to deploy the Watchtower smart contracts to Sepolia and Base Sepolia testnets, register FundVault as a CCIP token, and perform initial on-chain setup.

## Prerequisites

1. **Foundry installed** - Run `forge --version` to verify
2. **Funded wallet** - Your deployer address needs Sepolia ETH and Base Sepolia ETH
3. **Environment variables configured** - See `.env.example`

## Quick Start

### 1. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and configure:

- `SEPOLIA_RPC_URL` - Your Sepolia RPC endpoint (Infura, Alchemy, etc.)
- `BASE_SEPOLIA_RPC_URL` - Your Base Sepolia RPC endpoint
- `PRIVATE_KEY` - Private key of deployer account (must have ETH on both chains)
- `ETHERSCAN_API_KEY` - For contract verification
- Role addresses (optional - defaults to deployer if not set):
  - `ADMIN_ADDRESS`
  - `COMPLIANCE_OFFICER_ADDRESS`
  - `FUND_MANAGER_ADDRESS`
  - `CRE_WORKFLOW_ADDRESS`

### 2. Build & Test

```bash
forge build
forge test
```

All 102 tests should pass.

---

## Full Deployment (Both Chains)

### Step 1: Deploy Contracts on Sepolia

```bash
source .env

CCIP_ROUTER_ADDRESS=0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59 \
forge script script/DeployWatchtower.s.sol --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY" --broadcast
```

Note the deployed addresses from the output (especially **FundVault**).

### Step 2: Deploy Contracts on Base Sepolia

```bash
source .env

CCIP_ROUTER_ADDRESS=0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93 \
forge script script/DeployWatchtower.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY" --broadcast
```

Note the deployed addresses (especially **FundVault**).

### Step 3: Register FundVault with CCIP — Phase 1 (Both Chains)

This deploys a BurnMintTokenPool, registers FundVault with TokenAdminRegistry, and grants mint/burn roles to the pool.

**Sepolia:**
```bash
source .env

forge script script/RegisterFundVaultCCIP.s.sol \
  --sig "deployAndRegister(address)" <SEPOLIA_FUNDVAULT_ADDRESS> \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

**Base Sepolia:**
```bash
source .env

forge script script/RegisterFundVaultCCIP.s.sol \
  --sig "deployAndRegister(address)" <BASE_SEPOLIA_FUNDVAULT_ADDRESS> \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

Note the **BurnMintTokenPool** address from each chain's output.

### Step 4: Register FundVault with CCIP — Phase 2 (Both Chains)

This configures each pool to know about its remote counterpart. Run **after** Phase 1 completes on both chains.

**Sepolia (point to Base Sepolia pool):**
```bash
source .env

forge script script/RegisterFundVaultCCIP.s.sol \
  --sig "configureRemoteChain(address,address)" <SEPOLIA_POOL> <BASE_SEPOLIA_POOL> \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

**Base Sepolia (point to Sepolia pool):**
```bash
source .env

forge script script/RegisterFundVaultCCIP.s.sol \
  --sig "configureRemoteChain(address,address)" <BASE_SEPOLIA_POOL> <SEPOLIA_POOL> \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

---

## Post-Deployment Setup

After deploying and registering CCIP, perform these on-chain activities to initialize the system.

### Step 5: Whitelist Addresses for Compliance

Whitelist the deployer, FundVault, CCIP Router, and BurnMintTokenPool on both chains. This is required for deposits, withdrawals, transfers, and cross-chain bridging.

**Sepolia:**
```bash
source .env

# Whitelist deployer
cast send <COMPLIANCE_REGISTRY> "updateCompliance(address,bool,bool)" \
  <DEPLOYER_ADDRESS> true false \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

# Whitelist FundVault (needed for bridgeShares internal transfer)
cast send <COMPLIANCE_REGISTRY> "updateCompliance(address,bool,bool)" \
  <FUNDVAULT_ADDRESS> true false \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

# Whitelist CCIP Router (needed for cross-chain transfers)
cast send <COMPLIANCE_REGISTRY> "updateCompliance(address,bool,bool)" \
  0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59 true false \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

# Whitelist BurnMintTokenPool (receives shares during burn)
cast send <COMPLIANCE_REGISTRY> "updateCompliance(address,bool,bool)" \
  <SEPOLIA_POOL> true false \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
```

**Base Sepolia:** (same pattern, use Base Sepolia addresses)
```bash
source .env

cast send <BASE_COMPLIANCE_REGISTRY> "updateCompliance(address,bool,bool)" \
  <DEPLOYER_ADDRESS> true false \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

cast send <BASE_COMPLIANCE_REGISTRY> "updateCompliance(address,bool,bool)" \
  <BASE_FUNDVAULT_ADDRESS> true false \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

cast send <BASE_COMPLIANCE_REGISTRY> "updateCompliance(address,bool,bool)" \
  0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93 true false \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

cast send <BASE_COMPLIANCE_REGISTRY> "updateCompliance(address,bool,bool)" \
  <BASE_SEPOLIA_POOL> true false \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
```

### Step 6: Mint MockUSDC and Deposit into FundVault

```bash
source .env

# Mint 100,000 USDC (6 decimals = 100000e6 = 100000000000)
cast send <MOCK_USDC> "mint(address,uint256)" <DEPLOYER_ADDRESS> 100000000000 \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

# Approve FundVault to spend USDC
cast send <MOCK_USDC> "approve(address,uint256)" <FUNDVAULT_ADDRESS> 100000000000 \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

# Deposit 50,000 USDC into FundVault (mints 50,000 shares at 18 decimals)
cast send <FUNDVAULT_ADDRESS> "deposit(uint256)" 50000000000 \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
```

### Step 7: Update Oracle Scores

```bash
source .env

# Set risk score to 45 (medium risk)
cast send <RISK_ORACLE> "updateRiskScore(uint8,string)" 45 "QmManualUpdate" \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"

# Update Proof of Reserve data
cast send <POR_ORACLE> "updateReserves(uint256,uint256,uint256)" \
  50000000000 48000000000 49000000000 \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
```

### Step 8: Bridge Shares Cross-Chain

Bridge shares from Sepolia to Base Sepolia via CCIP:

```bash
source .env

# Bridge 10,000 shares (18 decimals = 10000e18 = 10000000000000000000000)
# Sends 0.0002 ETH for CCIP fee
cast send <FUNDVAULT_ADDRESS> "bridgeShares(uint64,address,uint256)" \
  10344971235874465080 <RECEIVER_ADDRESS> 10000000000000000000000 \
  --value 200000000000000 \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
```

Track the CCIP message at `https://ccip.chain.link/msg/<MESSAGE_ID>`. Cross-chain delivery takes ~15-20 minutes on testnets.

### Step 9: Verify State

```bash
source .env

# Check share balance on Sepolia
cast call <FUNDVAULT_ADDRESS> "balanceOf(address)(uint256)" <DEPLOYER_ADDRESS> \
  --rpc-url "$SEPOLIA_RPC_URL"

# Check total supply on Sepolia
cast call <FUNDVAULT_ADDRESS> "totalSupply()(uint256)" --rpc-url "$SEPOLIA_RPC_URL"

# Check share balance on Base Sepolia (after CCIP delivery)
cast call <BASE_FUNDVAULT_ADDRESS> "balanceOf(address)(uint256)" <DEPLOYER_ADDRESS> \
  --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

---

## Deployment Order Summary

The `DeployWatchtower.s.sol` script deploys contracts in this order:

1. **Oracle Contracts** (no dependencies):
   - ComplianceRegistry
   - RiskOracle
   - ProofOfReserveOracle

2. **Mock USDC + Protocols** (for testing)

3. **FundVault** (depends on oracles + USDC)

4. **Role Setup** — Grants `CRE_WORKFLOW_ROLE` on all contracts

5. **CCIP Router** (if `CCIP_ROUTER_ADDRESS` env var is set)

6. **Initialization** — Sets initial risk score (20) and reserves (0)

Then `RegisterFundVaultCCIP.s.sol` handles CCIP registration in two phases.

## CCIP Infrastructure Addresses

| Contract | Sepolia | Base Sepolia |
|:--|:--|:--|
| **CCIP Router** | `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` | `0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93` |
| **RMN Proxy** | `0xba3f6251de62dED61Ff98590cB2fDf6871FbB991` | `0x99360767a4705f68CcCb9533195B761648d6d807` |
| **TokenAdminRegistry** | `0x95F29FEE11c5C55d26cCcf1DB6772DE953B37B82` | `0x736D0bBb318c1B27Ff686cd19804094E66250e17` |
| **RegistryModule** | `0xa3c796d480638d7476792230da1E2ADa86e031b0` | `0x176ae8C6C11DD2c031B924CE1A0A43188035f3f6` |
| **Chain Selector** | `16015286601757825753` | `10344971235874465080` |

## Configuration Options

### Using Custom Addresses

Set these in `.env` to use specific addresses for roles:

```bash
ADMIN_ADDRESS=0x1234...
COMPLIANCE_OFFICER_ADDRESS=0x5678...
FUND_MANAGER_ADDRESS=0x9abc...
CRE_WORKFLOW_ADDRESS=0xdef0...
```

If not set, all roles default to the deployer address.

### Post-Deployment Admin Tasks

1. **Transfer Admin Role** - If deployer shouldn't be admin:
   ```solidity
   complianceRegistry.grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
   complianceRegistry.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddress);
   ```

2. **Update CRE Workflow Address** - Once Chainlink CRE workflows are deployed:
   ```solidity
   complianceRegistry.grantRole(CRE_WORKFLOW_ROLE, chainlinkDONAddress);
   complianceRegistry.revokeRole(CRE_WORKFLOW_ROLE, oldAddress);
   ```

## Verify Contracts Manually

If automatic verification fails:

```bash
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> \
  --chain-id 11155111 \
  --constructor-args $(cast abi-encode "constructor(address,address)" <ARG1> <ARG2>)
```

## Deployment Artifacts

- `broadcast/` - Transaction logs and receipts
- `deployments/sepolia.md` - Deployment addresses summary
- `out/` - Compiled contract artifacts

## Troubleshooting

### "Insufficient funds"
- Ensure deployer has enough ETH on both Sepolia and Base Sepolia
- Get testnet ETH from faucets: https://sepoliafaucet.com/

### "Nonce too low/high"
- Reset your nonce: `cast nonce <YOUR_ADDRESS> --rpc-url sepolia`

### "NotCompliant" on bridgeShares
- Ensure the CCIP Router, BurnMintTokenPool, FundVault, and the caller are all whitelisted in ComplianceRegistry on both chains

### CCIP message not arriving
- Cross-chain messages take ~15-20 minutes on testnets
- Track at: `https://ccip.chain.link/msg/<MESSAGE_ID>`

### Verification fails
- Wait a minute and retry
- Try manual verification (see above)
- Check Etherscan API key is correct

## Security Notes

- **Never commit `.env` file!** The `.gitignore` should already exclude it.
- **Use a dedicated deployer account.** Don't use your main wallet for deployments.
- **Verify on Etherscan.** Always verify contracts before users interact with them.
