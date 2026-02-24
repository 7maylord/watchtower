"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { formatUnits, type Address } from "viem";
import { sepolia } from "wagmi/chains";
import {
  CONTRACTS,
  riskOracleAbi,
  complianceRegistryAbi,
  proofOfReserveOracleAbi,
  fundVaultAbi,
} from "@/lib/contracts";

const REFETCH_INTERVAL = 30_000; // 30 seconds

// ============================================================
// useRiskScore — reads getCurrentRiskScore() from RiskOracle
// ============================================================
export function useRiskScore() {
  const { data, isLoading, isError, refetch } = useReadContract({
    address: CONTRACTS.riskOracle,
    abi: riskOracleAbi,
    functionName: "getCurrentRiskScore",
    chainId: sepolia.id,
    query: {
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  return {
    score: data ? Number(data[0]) : undefined,
    timestamp: data ? Number(data[1]) : undefined,
    ipfsHash: data ? data[2] : undefined,
    isLoading,
    isError,
    refetch,
  };
}

// ============================================================
// useShouldLiquidate — reads shouldTriggerLiquidation()
// ============================================================
export function useShouldLiquidate() {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.riskOracle,
    abi: riskOracleAbi,
    functionName: "shouldTriggerLiquidation",
    chainId: sepolia.id,
    query: {
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  return {
    shouldLiquidate: data ?? false,
    isLoading,
  };
}

// ============================================================
// useReserveData — reads getCurrentReserves() from PoR Oracle
// ============================================================
export function useReserveData() {
  const { data, isLoading, isError, refetch } = useReadContract({
    address: CONTRACTS.proofOfReserveOracle,
    abi: proofOfReserveOracleAbi,
    functionName: "getCurrentReserves",
    chainId: sepolia.id,
    query: {
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  const reserves = data as
    | {
        onChainReserves: bigint;
        custodianReserves: bigint;
        totalShares: bigint;
        reserveRatio: bigint;
        lastVerified: bigint;
        isHealthy: boolean;
      }
    | undefined;

  return {
    onChainReserves: reserves
      ? Number(formatUnits(reserves.onChainReserves, 6))
      : undefined,
    custodianReserves: reserves
      ? Number(formatUnits(reserves.custodianReserves, 6))
      : undefined,
    totalShares: reserves
      ? Number(formatUnits(reserves.totalShares, 18))
      : undefined,
    // reserveRatio is in basis points (10000 = 100%)
    reserveRatio: reserves ? Number(reserves.reserveRatio) / 100 : undefined,
    lastVerified: reserves ? Number(reserves.lastVerified) : undefined,
    isHealthy: reserves?.isHealthy ?? undefined,
    isLoading,
    isError,
    refetch,
  };
}

// ============================================================
// useComplianceStatus — reads getComplianceStatus(address)
// ============================================================
export function useComplianceStatus(address: Address | undefined) {
  const { data, isLoading, isError, refetch } = useReadContract({
    address: CONTRACTS.complianceRegistry,
    abi: complianceRegistryAbi,
    functionName: "getComplianceStatus",
    args: address ? [address] : undefined,
    chainId: sepolia.id,
    query: {
      enabled: !!address,
    },
  });

  return {
    hasKYC: data ? data[0] : undefined,
    sanctioned: data ? data[1] : undefined,
    lastUpdated: data ? Number(data[2]) : undefined,
    isLoading,
    isError,
    refetch,
  };
}

// ============================================================
// useFundVaultStats — reads totalSupply + sharePrice in parallel
// ============================================================
export function useFundVaultStats() {
  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.fundVault,
        abi: fundVaultAbi,
        functionName: "totalSupply",
        chainId: sepolia.id,
      },
      {
        address: CONTRACTS.fundVault,
        abi: fundVaultAbi,
        functionName: "sharePrice",
        chainId: sepolia.id,
      },
      {
        address: CONTRACTS.fundVault,
        abi: fundVaultAbi,
        functionName: "name",
        chainId: sepolia.id,
      },
    ],
    query: {
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  const totalSupplyRaw = data?.[0]?.result as bigint | undefined;
  const sharePriceRaw = data?.[1]?.result as bigint | undefined;
  const vaultName = data?.[2]?.result as string | undefined;

  return {
    totalSupply: totalSupplyRaw
      ? Number(formatUnits(totalSupplyRaw, 18))
      : undefined,
    // sharePrice is returned in 1e18 — convert to a human-readable ratio
    sharePrice: sharePriceRaw
      ? Number(formatUnits(sharePriceRaw, 18))
      : undefined,
    vaultName,
    isLoading,
    isError,
  };
}

// ============================================================
// useTotalAssets — reads totalAssets() from FundVault (USDC 6 dec)
// ============================================================
export function useTotalAssets() {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.fundVault,
    abi: fundVaultAbi,
    functionName: "totalAssets",
    chainId: sepolia.id,
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  return {
    totalAssets: data ? Number(formatUnits(data as bigint, 6)) : undefined,
    isLoading,
  };
}

// ============================================================
// usePortfolioAllocation — reads USDC, aToken, cToken balances
// to compute the live portfolio breakdown
// ============================================================
const IERC20_BALANCE = [
  {
    type: "function" as const,
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view" as const,
  },
] as const;

export function usePortfolioAllocation() {
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.mockUSDC,
        abi: IERC20_BALANCE,
        functionName: "balanceOf",
        args: [CONTRACTS.fundVault],
        chainId: sepolia.id,
      },
      {
        address: CONTRACTS.mockAavePool,
        abi: IERC20_BALANCE,
        functionName: "balanceOf",
        args: [CONTRACTS.fundVault],
        chainId: sepolia.id,
      },
      {
        address: CONTRACTS.mockCompoundReserve,
        abi: IERC20_BALANCE,
        functionName: "balanceOf",
        args: [CONTRACTS.fundVault],
        chainId: sepolia.id,
      },
    ],
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const idle = data?.[0]?.result as bigint | undefined;
  const aave = data?.[1]?.result as bigint | undefined;
  const compound = data?.[2]?.result as bigint | undefined;

  const idleNum = idle ? Number(formatUnits(idle, 6)) : 0;
  const aaveNum = aave ? Number(formatUnits(aave, 6)) : 0;
  const compNum = compound ? Number(formatUnits(compound, 6)) : 0;
  const total = idleNum + aaveNum + compNum;

  const allocation =
    total > 0
      ? [
          {
            name: "Idle USDC",
            value: Math.round((idleNum / total) * 100),
            amount: idleNum,
            color: "hsl(217, 91%, 60%)",
          },
          {
            name: "Aave V3",
            value: Math.round((aaveNum / total) * 100),
            amount: aaveNum,
            color: "hsl(260, 60%, 55%)",
          },
          {
            name: "Compound V3",
            value: Math.round((compNum / total) * 100),
            amount: compNum,
            color: "hsl(142, 71%, 45%)",
          },
        ]
      : undefined;

  return { allocation, total, isLoading };
}

// ============================================================
// Utility: format a UNIX timestamp to relative "X ago" string
// ============================================================
export function formatTimeAgo(timestamp: number | undefined): string {
  if (!timestamp || timestamp === 0) return "Never";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
