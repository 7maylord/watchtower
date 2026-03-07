"use client";

import { useReadContract, useWriteContract, useChainId } from "wagmi";
import { parseEther, type Address } from "viem";
import { useMemo } from "react";
import {
  getContractsForChain,
  fundVaultAbi,
  CCIP_CHAIN_SELECTORS,
  DESTINATION_CHAIN,
  SUPPORTED_CHAINS,
} from "@/lib/contracts";

/**
 * Hook for cross-chain share bridging via CCIP.
 * Reads the bridge fee and provides a write function to bridge shares.
 */
export function useCCIPBridge(receiver: Address | undefined, amount: bigint) {
  const chainId = useChainId();
  const contracts = useMemo(() => getContractsForChain(chainId), [chainId]);

  const destChainId = DESTINATION_CHAIN[chainId];
  const destChainSelector = CCIP_CHAIN_SELECTORS[destChainId];
  const destChainName =
    SUPPORTED_CHAINS.find((c) => c.id === destChainId)?.name ?? "Unknown";

  // Read estimated bridge fee
  const {
    data: bridgeFee,
    isLoading: isFeeLoading,
    isError: isFeeError,
  } = useReadContract({
    address: contracts.fundVault,
    abi: fundVaultAbi,
    functionName: "getBridgeFee",
    args:
      destChainSelector && receiver
        ? [destChainSelector, receiver, amount]
        : undefined,
    query: {
      enabled: !!destChainSelector && !!receiver && amount > BigInt(0),
    },
  });

  // Write: bridge shares
  const {
    writeContract,
    data: txHash,
    isPending,
    isSuccess,
    isError: isWriteError,
    error: writeError,
    reset,
  } = useWriteContract();

  const bridgeShares = () => {
    if (!destChainSelector || !receiver || !bridgeFee) return;

    writeContract({
      address: contracts.fundVault,
      abi: fundVaultAbi,
      functionName: "bridgeShares",
      args: [destChainSelector, receiver, amount],
      value: bridgeFee as bigint,
    });
  };

  return {
    destChainId,
    destChainName,
    destChainSelector,
    bridgeFee: bridgeFee as bigint | undefined,
    isFeeLoading,
    isFeeError,
    bridgeShares,
    txHash,
    isPending,
    isSuccess,
    isWriteError,
    writeError,
    reset,
  };
}
