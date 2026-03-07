import { type Address } from "viem";

import { riskOracleAbi } from "./abi/RiskOracle";
import { complianceRegistryAbi } from "./abi/ComplianceRegistry";
import { proofOfReserveOracleAbi } from "./abi/ProofOfReserveOracle";
import { fundVaultAbi } from "./abi/FundVault";

// Chain IDs
export const SEPOLIA_CHAIN_ID = 11155111;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

// Per-chain contract addresses
export type ChainContracts = {
  complianceRegistry: Address;
  riskOracle: Address;
  proofOfReserveOracle: Address;
  fundVault: Address;
  mockUSDC: Address;
  mockAavePool: Address;
  mockCompoundReserve: Address;
  ccipRouter: Address;
};

export const SEPOLIA_CONTRACTS: ChainContracts = {
  complianceRegistry: "0x164940bd662A21174dd5Db21AECc1Ae46d8b1c56" as Address,
  riskOracle: "0x17238806EdDcF45c0e85eE3FC74ad7A2e4f128A7" as Address,
  proofOfReserveOracle: "0xcb66fe00e909E86Fb2F392DD0c2122E1ac7Eed52" as Address,
  fundVault: "0x27b2e0AF46B4E63749DF2Ef4325FDa82F9b86ED2" as Address,
  mockUSDC: "0x57a1c6761Ccade88c5eA2735BfbAC0EA83E4707D" as Address,
  mockAavePool: "0xAC7a14650aD408a9958a6Df0A7453e0D809aa869" as Address,
  mockCompoundReserve: "0xa354b536E9Ae3C70B90F1f17616Ca1F1f57CC027" as Address,
  ccipRouter: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59" as Address,
};

export const BASE_SEPOLIA_CONTRACTS: ChainContracts = {
  complianceRegistry: "0xB14a5927b20927A8812AC060c00CBE17772CcFA0" as Address,
  riskOracle: "0xe47691F0188D8BD9013e1a5cCaF34baD0b37cf4B" as Address,
  proofOfReserveOracle: "0x892C2C0eD81f80Ba727af29c7A128A4A2e9d053c" as Address,
  fundVault: "0x785708dD1753fdEAc9C3d1aaC02f5c0cd3B1858D" as Address,
  mockUSDC: "0xe41e15b91Ae30f3cB4f0193c4ca1f00c82342D8f" as Address,
  mockAavePool: "0xB6A8946E994e401cF9845E7a0a276d3233667a84" as Address,
  mockCompoundReserve: "0x9B489aECB74F689Ea108a85186a1D4C8f626E0d4" as Address,
  ccipRouter: "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93" as Address,
};

// All supported chains
export const SUPPORTED_CHAINS = [
  {
    id: SEPOLIA_CHAIN_ID,
    name: "Ethereum Sepolia",
    contracts: SEPOLIA_CONTRACTS,
  },
  {
    id: BASE_SEPOLIA_CHAIN_ID,
    name: "Base Sepolia",
    contracts: BASE_SEPOLIA_CONTRACTS,
  },
] as const;

// CCIP chain selectors (used by CCIP Router for cross-chain messaging)
export const CCIP_CHAIN_SELECTORS: Record<number, bigint> = {
  [SEPOLIA_CHAIN_ID]: BigInt("16015286601757825753"),
  [BASE_SEPOLIA_CHAIN_ID]: BigInt("10344971235874465080"),
};

// Maps each chain to its cross-chain destination
export const DESTINATION_CHAIN: Record<number, number> = {
  [SEPOLIA_CHAIN_ID]: BASE_SEPOLIA_CHAIN_ID,
  [BASE_SEPOLIA_CHAIN_ID]: SEPOLIA_CHAIN_ID,
};

// Helper to get contracts for a specific chain
export function getContractsForChain(chainId: number): ChainContracts {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!chain) return SEPOLIA_CONTRACTS; // fallback
  return chain.contracts;
}

// Backward-compatible default (Sepolia)
export const CONTRACTS = SEPOLIA_CONTRACTS;

// ABIs
export {
  riskOracleAbi,
  complianceRegistryAbi,
  proofOfReserveOracleAbi,
  fundVaultAbi,
};
