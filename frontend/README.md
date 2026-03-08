# Watchtower Frontend

Real-time institutional DeFi monitoring dashboard built with Next.js 16, Tailwind CSS 4, and RainbowKit. Connects to Watchtower smart contracts on Ethereum Sepolia and Base Sepolia.

## Overview

The frontend provides a wallet-connected dashboard for monitoring vault health, compliance status, reserve ratios, and AI-driven rebalancing recommendations. It reads live data from on-chain contracts via wagmi hooks and displays historical CRE workflow reports from Firebase Firestore.

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Public hero page — feature showcase, no wallet required |
| Dashboard | `/dashboard` | System health overview with risk gauge, compliance stats, and activity log |
| Portfolio Health | `/portfolio` | AI risk scoring, token allocation breakdown, IPFS report history |
| Compliance | `/compliance` | Address screening status, KYC/sanctions results from Chainalysis |
| Proof of Reserve | `/reserves` | Reserve ratio tracking, on-chain vs. custodian balance comparison |
| Rebalancing | `/rebalancing` | AI recommendations, risk/return analysis, CCIP cross-chain bridging |
| Settings | `/settings` | Workflow schedules, contract addresses, API integration config |

All dashboard pages are protected by `<WalletGate>` — users must connect a wallet to access them.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, Radix UI, Shadcn UI |
| Web3 | wagmi v2, viem v2, RainbowKit v2 |
| State | TanStack React Query |
| Charts | Recharts |
| Backend | Firebase Firestore (REST API, anonymous auth) |

## Smart Contract Integration

The frontend reads from four deployed contracts using wagmi's `useReadContract` hooks with a 30-second refetch interval:

| Hook | Contract | Method | Purpose |
|------|----------|--------|---------|
| `useRiskScore()` | RiskOracle | `getCurrentRiskScore()` | Risk score, timestamp, IPFS hash |
| `useShouldLiquidate()` | RiskOracle | `shouldLiquidate()` | Liquidation threshold check |
| `useComplianceStatus(addr)` | ComplianceRegistry | `getComplianceStatus()` | KYC + sanctions status |
| `useReserveData()` | ProofOfReserveOracle | `getCurrentReserves()` | Reserve ratio, balances |
| `useFundVaultStats()` | FundVault | `totalSupply()`, `sharePrice()` | Vault share metrics |
| `useTotalAssets()` | FundVault | `totalAssets()` | Total portfolio value |
| `usePortfolioAllocation()` | ERC20 | `balanceOf()` | USDC/Aave/Compound balances |
| `useCCIPBridge()` | FundVault | `bridgeShares()`, `getBridgeFee()` | Cross-chain share bridging |

Contract addresses and ABIs are centralized in `lib/contracts.ts` and `lib/abi/`.

### Supported Chains

- Ethereum Sepolia (Chain ID: 11155111)
- Base Sepolia (Chain ID: 84532)

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx                # Landing page
│   ├── layout.tsx              # Root layout
│   ├── providers.tsx           # Wagmi + RainbowKit + React Query
│   ├── dashboard/page.tsx      # Overview dashboard
│   ├── portfolio/page.tsx      # Portfolio health
│   ├── compliance/page.tsx     # Compliance screening
│   ├── reserves/page.tsx       # Proof of reserve
│   ├── rebalancing/page.tsx    # Rebalancing advisor + CCIP bridge
│   └── settings/page.tsx       # Configuration
├── components/
│   ├── DashboardLayout.tsx     # Sidebar nav + mobile menu
│   ├── WalletGate.tsx          # Wallet auth guard
│   ├── RiskGauge.tsx           # Circular risk score visualization
│   ├── StatusBadge.tsx         # Colored status indicators
│   └── ui/                     # Radix/Shadcn component library
├── hooks/
│   ├── useContractData.ts      # All wagmi contract read hooks
│   ├── useCCIPBridge.ts        # Cross-chain bridging hook
│   └── use-mobile.tsx          # Responsive breakpoint detection
├── lib/
│   ├── contracts.ts            # Contract addresses & chain config
│   ├── firestore.ts            # Firebase report fetching
│   ├── mock-data.ts            # Fallback data for development
│   ├── utils.ts                # Helpers
│   └── abi/                    # Contract ABIs (4 files)
└── public/                     # Static assets
```

## Quick Start

### Prerequisites

- Node.js >= 18

### Development

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### Production Build

```bash
npm run build
npm start
```

## Related

- [Main Project README](../README.md)
- [Smart Contracts](../smart-contracts/README.md)
- [CRE Workflows](../cre-workflow/README.md)
