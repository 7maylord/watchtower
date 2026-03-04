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
};

export const SEPOLIA_CONTRACTS: ChainContracts = {
  complianceRegistry: "0xe67ae2ac43d527900d975a732c1bef46af41ca74" as Address,
  riskOracle: "0xff3c4ac97f2dfb15ada9f53627b5c54d0a2fa5b0" as Address,
  proofOfReserveOracle: "0xa35eda8566c3d2be525c27eaed9f91625475afe2" as Address,
  fundVault: "0x400ca83357f9d141144dd4ad3129790c90ee2a83" as Address,
  mockUSDC: "0x6832ba0f8a044e9ea8f90b8bea9fcf8db54950d2" as Address,
  mockAavePool: "0x82b66c77971056e352b47303f3c5f726118325c4" as Address,
  mockCompoundReserve: "0x3e06ac1b578252021a360de2ab8df0c7dc2ee417" as Address,
};

export const BASE_SEPOLIA_CONTRACTS: ChainContracts = {
  complianceRegistry: "0xb3bf5ebc87234ce49d6bb423b85e23a3eb083fe0" as Address,
  riskOracle: "0x38977cf2979f5040b5cc660812e1faf802e15adc" as Address,
  proofOfReserveOracle: "0x2cb551cba355339f3c6b43f931bbfde60e6986fa" as Address,
  fundVault: "0x1a7d6e82afbc0069bde8a33c86d8439c06f2daa5" as Address,
  mockUSDC: "0x73a834d8de5fe088cb183132358cd98e5fc3a9b9" as Address,
  mockAavePool: "0x31f85c18172baa5d796ff140d8db4799bcf1a8bf" as Address,
  mockCompoundReserve: "0xdd552b4db4007d4973adc12a46928ef5bc411c5d" as Address,
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
