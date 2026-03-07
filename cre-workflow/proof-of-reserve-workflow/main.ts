import {
  bytesToHex,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  type Runtime,
  TxStatus,
  cre,
  type EVMLog,
} from "@chainlink/cre-sdk";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  zeroAddress,
  keccak256,
  toHex,
  parseAbi,
  decodeEventLog,
} from "viem";
import { z } from "zod";
import {
  ProofOfReserveOracleAbi,
  FundVaultAbi,
  IERC20,
} from "../contracts/abi";
import { FirebaseClient } from "./firebase";
import { StructuredLogger, withErrorHandling } from "./utils";

// Configuration schema
const evmChainSchema = z.object({
  chainName: z.string(),
  proofOfReserveOracleAddress: z.string(),
  fundVaultAddress: z.string(),
  mockUSDCAddress: z.string(),
  gasLimit: z.string(),
});

const configSchema = z.object({
  schedule: z.string(),
  evms: z.array(evmChainSchema),
  firebaseApiKey: z.string(),
  firebaseProjectId: z.string(),
});

type Config = z.infer<typeof configSchema>;
type EVMChain = z.infer<typeof evmChainSchema>;

/**
 * PRODUCTION Proof of Reserve Workflow
 *
 * Verifies custodial holdings and uploads attestations to IPFS
 * NOTE: Custodian API integration optional - works with on-chain verification
 */

/**
 * Get total assets from FundVault on a specific chain
 */
const getTotalAssets = (runtime: Runtime<Config>, chain: EVMChain): bigint => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chain.chainName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found for chain selector: ${chain.chainName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  const callData = encodeFunctionData({
    abi: FundVaultAbi,
    functionName: "totalAssets",
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: chain.fundVaultAddress as Address,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const totalAssets = decodeFunctionResult({
    abi: FundVaultAbi,
    functionName: "totalAssets",
    data: bytesToHex(contractCall.data),
  });

  return totalAssets as bigint;
};

/**
 * Get actual USDC balance in FundVault on a specific chain
 */
const getActualBalance = (
  runtime: Runtime<Config>,
  chain: EVMChain,
): bigint => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chain.chainName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found for chain selector: ${chain.chainName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  const callData = encodeFunctionData({
    abi: IERC20,
    functionName: "balanceOf",
    args: [chain.fundVaultAddress as Address],
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: chain.mockUSDCAddress as Address,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const balance = decodeFunctionResult({
    abi: IERC20,
    functionName: "balanceOf",
    data: bytesToHex(contractCall.data),
  });

  return balance as bigint;
};

/**
 * Get current reserves from ProofOfReserveOracle on a specific chain
 */
const getCurrentReserves = (
  runtime: Runtime<Config>,
  chain: EVMChain,
): bigint => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chain.chainName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found for chain selector: ${chain.chainName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  const callData = encodeFunctionData({
    abi: ProofOfReserveOracleAbi,
    functionName: "getCurrentReserves",
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: chain.proofOfReserveOracleAddress as Address,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const result = decodeFunctionResult({
    abi: ProofOfReserveOracleAbi,
    functionName: "getCurrentReserves",
    data: bytesToHex(contractCall.data),
  });

  // Extract onChainReserves from the struct
  const reserves = result as any;
  return BigInt(reserves.onChainReserves || 0);
};

/**
 * Update ProofOfReserveOracle on a specific chain
 */
const updateReserves = (
  runtime: Runtime<Config>,
  chain: EVMChain,
  totalReserves: bigint,
  reportHash: string,
): string => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chain.chainName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found for chain selector: ${chain.chainName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);
  const logger = new StructuredLogger(runtime);

  logger.info(`Updating ProofOfReserveOracle on ${chain.chainName}`, {
    totalReserves: `$${(Number(totalReserves) / 1e6).toLocaleString()}`,
    reportHash,
  });

  const callData = encodeFunctionData({
    abi: ProofOfReserveOracleAbi,
    functionName: "updateReserves",
    args: [totalReserves, reportHash],
  });

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(callData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const resp = evmClient
    .writeReport(runtime, {
      receiver: chain.proofOfReserveOracleAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: chain.gasLimit,
      },
    })
    .result();

  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update ProofOfReserveOracle on ${chain.chainName}: ${resp.errorMessage || resp.txStatus}`,
    );
  }

  const txHash = bytesToHex(resp.txHash || new Uint8Array(32));
  logger.success(`ProofOfReserveOracle updated on ${chain.chainName}`, {
    txHash,
  });

  return txHash;
};

/**
 * Main workflow logic — aggregates reserves across all chains
 */
const runProofOfReserveWorkflow = async (
  runtime: Runtime<Config>,
): Promise<string> => {
  const logger = new StructuredLogger(runtime);

  logger.info(
    `🚀 Starting Multi-chain Proof of Reserve Verification (${runtime.config.evms.length} chains)`,
  );

  return withErrorHandling(
    async () => {
      let aggregatedAssets = BigInt(0);
      let aggregatedBalance = BigInt(0);
      const chainReports: {
        chainName: string;
        totalAssets: string;
        balance: string;
        ratio: string;
      }[] = [];

      for (const chain of runtime.config.evms) {
        // Step 1: Read total assets
        const totalAssets = getTotalAssets(runtime, chain);
        const assetsInUSDC = Number(totalAssets) / 1e6;

        // Step 2: Get actual USDC balance
        const actualBalance = getActualBalance(runtime, chain);
        const balanceInUSDC = Number(actualBalance) / 1e6;

        let reserveRatio = 10000;
        if (totalAssets > 0n) {
          reserveRatio = Number((actualBalance * 10000n) / totalAssets);
        }

        aggregatedAssets += totalAssets;
        aggregatedBalance += actualBalance;

        chainReports.push({
          chainName: chain.chainName,
          totalAssets: `$${assetsInUSDC.toLocaleString()}`,
          balance: `$${balanceInUSDC.toLocaleString()}`,
          ratio: `${(reserveRatio / 100).toFixed(2)}%`,
        });

        logger.info(`Chain ${chain.chainName} reserves`, {
          totalAssets: `$${assetsInUSDC.toLocaleString()}`,
          balance: `$${balanceInUSDC.toLocaleString()}`,
          ratio: `${(reserveRatio / 100).toFixed(2)}%`,
        });
      }

      // Overall reserve ratio
      let overallRatio = 10000;
      if (aggregatedAssets > 0n) {
        overallRatio = Number((aggregatedBalance * 10000n) / aggregatedAssets);
      }

      logger.info("Aggregated reserves", {
        totalAssets: `$${(Number(aggregatedAssets) / 1e6).toLocaleString()}`,
        totalBalance: `$${(Number(aggregatedBalance) / 1e6).toLocaleString()}`,
        overallRatio: `${(overallRatio / 100).toFixed(2)}%`,
        chains: runtime.config.evms.length,
      });

      // Step 5: Check if update needed (using primary chain)
      const primaryChain = runtime.config.evms[0];
      const currentReserves = getCurrentReserves(runtime, primaryChain);
      const diff =
        aggregatedBalance > currentReserves
          ? aggregatedBalance - currentReserves
          : currentReserves - aggregatedBalance;

      if (diff < 1000000n) {
        logger.info("Reserve change too small, skipping update");
        return "No update needed";
      }

      // Step 6: Upload PoR report to Firebase
      const firebase = new FirebaseClient(
        runtime,
        runtime.config.firebaseApiKey,
        runtime.config.firebaseProjectId,
      );

      const ipfsHash = firebase.uploadReserveReport(runtime, {
        timestamp: Date.now(),
        totalReserves: `$${(Number(aggregatedBalance) / 1e6).toLocaleString()} USDC`,
        actualBalance: `$${(Number(aggregatedBalance) / 1e6).toLocaleString()} USDC`,
        reserveRatio: `${(overallRatio / 100).toFixed(2)}%`,
        attestation: "On-chain USDC balance verified across all chains",
        chains: chainReports,
      });

      logger.success("PoR report uploaded to Firebase", { ipfsHash });

      // Step 7: Update ProofOfReserveOracle on ALL chains
      const txHashes: string[] = [];
      for (const chain of runtime.config.evms) {
        const txHash = updateReserves(
          runtime,
          chain,
          aggregatedBalance,
          ipfsHash,
        );
        txHashes.push(txHash);
      }

      logger.success("✅ Multi-chain Proof of Reserve Verification Complete", {
        txHashes,
        ipfsHash,
        reserveRatio: `${(overallRatio / 100).toFixed(2)}%`,
        chainsUpdated: runtime.config.evms.length,
      });

      return txHashes.join(",");
    },
    { operation: "Proof of Reserve Verification", runtime },
  );
};

/**
 * ABI for the ReserveVerificationRequested event
 */
const eventAbi = parseAbi([
  "event ReserveVerificationRequested(address indexed requester, uint256 timestamp)",
]);
const eventSignature = "ReserveVerificationRequested(address,uint256)";

/**
 * Log trigger handler — runs when ReserveVerificationRequested is emitted
 */
const onLogTrigger = async (
  runtime: Runtime<Config>,
  log: EVMLog,
): Promise<string> => {
  const topics = log.topics.map((t) => bytesToHex(t)) as [
    `0x${string}`,
    ...`0x${string}`[],
  ];
  const data = bytesToHex(log.data);

  const decodedLog = decodeEventLog({ abi: eventAbi, data, topics });
  runtime.log(
    `ReserveVerificationRequested by ${decodedLog.args.requester} at ${decodedLog.args.timestamp}`,
  );

  return runProofOfReserveWorkflow(runtime);
};

/**
 * Initialize workflow — listens for ReserveVerificationRequested events on ALL chains
 */
const initWorkflow = (config: Config) => {
  const eventHash = keccak256(toHex(eventSignature));
  const handlers = [];

  for (const chain of config.evms) {
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: chain.chainName,
      isTestnet: true,
    });

    if (!network) {
      throw new Error(`Network not found: ${chain.chainName}`);
    }

    const evmClient = new cre.capabilities.EVMClient(
      network.chainSelector.selector,
    );

    handlers.push(
      cre.handler(
        evmClient.logTrigger({
          addresses: [chain.proofOfReserveOracleAddress],
          topics: [{ values: [eventHash] }],
          confidence: "CONFIDENCE_LEVEL_FINALIZED",
        }),
        onLogTrigger,
      ),
    );
  }

  return handlers;
};

/**
 * Main entry point
 */
export async function main() {
  const runner = await Runner.newRunner<Config>({
    configSchema,
  });
  await runner.run(initWorkflow);
}
