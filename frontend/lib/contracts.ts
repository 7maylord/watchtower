import { type Address } from "viem";

import { riskOracleAbi } from "./abi/RiskOracle";
import { complianceRegistryAbi } from "./abi/ComplianceRegistry";
import { proofOfReserveOracleAbi } from "./abi/ProofOfReserveOracle";
import { fundVaultAbi } from "./abi/FundVault";

// Deployed Sepolia Contract Addresses
export const SEPOLIA_CHAIN_ID = 11155111;

export const CONTRACTS = {
  complianceRegistry: "0x87cb61495407e36ce2d8b511adf11d5e8d6d15da" as Address,
  riskOracle: "0x763f6f8cc5a24e1f4dd45e87cb47b1ba747c3b0a" as Address,
  proofOfReserveOracle: "0x0ec521b25e57450bda5fe64f22f77016c8666fe2" as Address,
  fundVault: "0x6b3aa0d68fba3ff8add42071ba82e714b5a6a488" as Address,
  mockUSDC: "0x421b8461983a5219a0a3bd49ac8618c0ee3eef9c" as Address,
  mockAavePool: "0x3e62443746159222402430711d1421bf2a74366c" as Address,
  mockCompoundReserve: "0x94683345cd52a2cc353878f38fa09e9b3f0666af" as Address,
} as const;

// ABIs
export {
  riskOracleAbi,
  complianceRegistryAbi,
  proofOfReserveOracleAbi,
  fundVaultAbi,
};
