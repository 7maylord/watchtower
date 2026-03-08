"use client";

import { useReadContract, useReadContracts, useChainId } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useState, useEffect, useMemo } from "react";
import {
  getContractsForChain,
  riskOracleAbi,
  complianceRegistryAbi,
  proofOfReserveOracleAbi,
  fundVaultAbi,
  type ChainContracts,
} from "@/lib/contracts";

const REFETCH_INTERVAL = 30_000; // 30 seconds

// ============================================================
// useActiveChainContracts — returns contracts for the connected chain
// ============================================================
export function useActiveChainContracts(): {
  contracts: ChainContracts;
  chainId: number;
} {
  const chainId = useChainId();
  const contracts = useMemo(() => getContractsForChain(chainId), [chainId]);
  return { contracts, chainId };
}

// ============================================================
// useRiskScore — reads getCurrentRiskScore() from RiskOracle
// ============================================================
export function useRiskScore() {
  const { contracts, chainId } = useActiveChainContracts();

  const { data, isLoading, isError, refetch } = useReadContract({
    address: contracts.riskOracle,
    abi: riskOracleAbi,
    functionName: "getCurrentRiskScore",
    chainId,
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
  const { contracts, chainId } = useActiveChainContracts();

  const { data, isLoading } = useReadContract({
    address: contracts.riskOracle,
    abi: riskOracleAbi,
    functionName: "shouldTriggerLiquidation",
    chainId,
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
  const { contracts, chainId } = useActiveChainContracts();

  const { data, isLoading, isError, refetch } = useReadContract({
    address: contracts.proofOfReserveOracle,
    abi: proofOfReserveOracleAbi,
    functionName: "getCurrentReserves",
    chainId,
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
  const { contracts, chainId } = useActiveChainContracts();

  const { data, isLoading, isError, refetch } = useReadContract({
    address: contracts.complianceRegistry,
    abi: complianceRegistryAbi,
    functionName: "getComplianceStatus",
    args: address ? [address] : undefined,
    chainId,
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
  const { contracts, chainId } = useActiveChainContracts();

  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      {
        address: contracts.fundVault,
        abi: fundVaultAbi,
        functionName: "totalSupply",
        chainId,
      },
      {
        address: contracts.fundVault,
        abi: fundVaultAbi,
        functionName: "sharePrice",
        chainId,
      },
      {
        address: contracts.fundVault,
        abi: fundVaultAbi,
        functionName: "name",
        chainId,
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
  const { contracts, chainId } = useActiveChainContracts();

  const { data, isLoading } = useReadContract({
    address: contracts.fundVault,
    abi: fundVaultAbi,
    functionName: "totalAssets",
    chainId,
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
  const { contracts, chainId } = useActiveChainContracts();

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: contracts.mockUSDC,
        abi: IERC20_BALANCE,
        functionName: "balanceOf",
        args: [contracts.fundVault],
        chainId,
      },
      {
        address: contracts.mockAavePool,
        abi: IERC20_BALANCE,
        functionName: "balanceOf",
        args: [contracts.fundVault],
        chainId,
      },
      {
        address: contracts.mockCompoundReserve,
        abi: IERC20_BALANCE,
        functionName: "balanceOf",
        args: [contracts.fundVault],
        chainId,
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

// ============================================================
// useRebalancingHistory — reads rebalancing reports from Firestore
// ============================================================
export type RebalancingEntry = {
  date: string;
  action: string;
  confidence: number;
  status: "executed" | "skipped";
  analysis: string;
  documentId: string;
};

export function useRebalancingHistory() {
  const [history, setHistory] = useState<RebalancingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { fetchRebalancingReports } = await import("@/lib/firestore");
        const reports = await fetchRebalancingReports();
        setHistory(reports);
      } catch (e) {
        console.error("Failed to fetch rebalancing reports:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, []);

  return { history, isLoading };
}

// ============================================================
// useRiskReports — reads risk reports from Firestore
// ============================================================
export type RiskReportEntry = {
  date: string;
  score: number;
  status: "healthy" | "moderate" | "critical";
  analysis: string;
  documentId: string;
};

export function useRiskReports() {
  const [reports, setReports] = useState<RiskReportEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { fetchRiskReports } = await import("@/lib/firestore");
        const data = await fetchRiskReports();
        setReports(data);
      } catch (e) {
        console.error("Failed to fetch risk reports:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, []);

  return { reports, isLoading };
}

// ============================================================
// useReserveReports — reads reserve reports from Firestore
// ============================================================
export type ReserveReportEntry = {
  date: string;
  totalReserves: string;
  actualBalance: string;
  reserveRatio: string;
  attestation: string;
  documentId: string;
};

export function useReserveReports() {
  const [reports, setReports] = useState<ReserveReportEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { fetchReserveReports } = await import("@/lib/firestore");
        const data = await fetchReserveReports();
        setReports(data);
      } catch (e) {
        console.error("Failed to fetch reserve reports:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, []);

  return { reports, isLoading };
}

// ============================================================
// useComplianceHistory — reads compliance reports from Firestore
// ============================================================
export type ComplianceEntry = {
  address: string;
  status: "approved" | "flagged";
  riskScore: number;
  date: string;
  screeningDetails: string;
  documentId: string;
};

export function useComplianceHistory() {
  const [history, setHistory] = useState<ComplianceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { fetchComplianceReports } = await import("@/lib/firestore");
        const reports = await fetchComplianceReports();
        setHistory(reports);
      } catch (e) {
        console.error("Failed to fetch compliance reports:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReports();
  }, []);

  return { history, isLoading };
}
