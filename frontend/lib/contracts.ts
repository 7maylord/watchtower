import { type Address } from "viem";

import { riskOracleAbi } from "./abi/RiskOracle";
import { complianceRegistryAbi } from "./abi/ComplianceRegistry";
import { proofOfReserveOracleAbi } from "./abi/ProofOfReserveOracle";
import { fundVaultAbi } from "./abi/FundVault";

// Deployed Sepolia Contract Addresses
export const SEPOLIA_CHAIN_ID = 11155111;

export const CONTRACTS = {
  complianceRegistry: "0x06e5Bab3816f49c4DEdF8A4bfF0779346626Eaa0" as Address,
  riskOracle: "0x915dDC95D58a38A4065F77517ce70D4A2A0F1d88" as Address,
  proofOfReserveOracle: "0x05427E93Da066DA812ce3C50C9901433e187f792" as Address,
  fundVault: "0x5DDe75De392870BFD8f1BF1268a85765711DBF3e" as Address,
  mockUSDC: "0x562c664b67a12767efc7a13D712C66C602240760" as Address,
} as const;

// ABIs
export {
  riskOracleAbi,
  complianceRegistryAbi,
  proofOfReserveOracleAbi,
  fundVaultAbi,
};
