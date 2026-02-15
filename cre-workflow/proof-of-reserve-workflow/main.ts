import {
  bytesToHex,
  type CronPayload,
  handler,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  zeroAddress,
} from "viem";
import { z } from "zod";
import {
  ProofOfReserveOracleAbi,
  FundVaultAbi,
  IERC20,
} from "../contracts/abi";
import { PinataClient } from "../shared/pinata";
import { StructuredLogger, withErrorHandling } from "../shared/utils";

// Configuration schema
const configSchema = z.object({
  schedule: z.string(),
  proofOfReserveOracleAddress: z.string(),
  fundVaultAddress: z.string(),
  mockUSDCAddress: z.string(),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  pinataApiKey: z.string(),
  pinataApiSecret: z.string(),
});

type Config = z.infer<typeof configSchema>;

/**
 * PRODUCTION Proof of Reserve Workflow
 *
 * Verifies custodial holdings and uploads attestations to IPFS
 * NOTE: Custodian API integration optional - works with on-chain verification
 */

/**
 * Get total assets from FundVault
 */
const getTotalAssets = (runtime: Runtime<Config>): bigint => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(
      `Network not found for chain selector: ${runtime.config.chainSelectorName}`,
    );
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
        to: runtime.config.fundVaultAddress as Address,
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
 * Get actual USDC balance in FundVault
 */
const getActualBalance = (runtime: Runtime<Config>): bigint => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(
      `Network not found for chain selector: ${runtime.config.chainSelectorName}`,
    );
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  const callData = encodeFunctionData({
    abi: IERC20,
    functionName: "balanceOf",
    args: [runtime.config.fundVaultAddress as Address],
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.mockUSDCAddress as Address,
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
 * Get current reserves from ProofOfReserveOracle
 */
const getCurrentReserves = (runtime: Runtime<Config>): bigint => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(
      `Network not found for chain selector: ${runtime.config.chainSelectorName}`,
    );
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
        to: runtime.config.proofOfReserveOracleAddress as Address,
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
 * Update ProofOfReserveOracle
 */
const updateReserves = (
  runtime: Runtime<Config>,
  totalReserves: bigint,
  reportHash: string,
): string => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(
      `Network not found for chain selector: ${runtime.config.chainSelectorName}`,
    );
  }

  const evmClient = new EVMClient(network.chainSelector.selector);
  const logger = new StructuredLogger(runtime);

  logger.info("Updating ProofOfReserveOracle", {
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
      receiver: runtime.config.proofOfReserveOracleAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update ProofOfReserveOracle: ${resp.errorMessage || resp.txStatus}`,
    );
  }

  const txHash = bytesToHex(resp.txHash || new Uint8Array(32));
  logger.success("ProofOfReserveOracle updated", { txHash });

  return txHash;
};

/**
 * Main workflow logic
 */
const runProofOfReserveWorkflow = async (
  runtime: Runtime<Config>,
): Promise<string> => {
  const logger = new StructuredLogger(runtime);

  logger.info("🚀 Starting Production Proof of Reserve Verification");

  return withErrorHandling(
    async () => {
      // Step 1: Read total assets
      const totalAssets = getTotalAssets(runtime);
      const assetsInUSDC = Number(totalAssets) / 1e6;

      logger.info("Total assets", {
        totalAssets: `$${assetsInUSDC.toLocaleString()}`,
      });

      // Step 2: Get actual USDC balance
      const actualBalance = getActualBalance(runtime);
      const balanceInUSDC = Number(actualBalance) / 1e6;

      logger.info("Actual USDC balance", {
        balance: `$${balanceInUSDC.toLocaleString()}`,
      });

      // Step 3: Calculate total reserves (on-chain only for now)
      const totalReserves = actualBalance;
      const reservesInUSDC = Number(totalReserves) / 1e6;

      logger.info("Total reserves", {
        reserves: `$${reservesInUSDC.toLocaleString()}`,
      });

      // Step 4: Calculate reserve ratio
      let reserveRatio = 10000; // 100% in basis points
      if (totalAssets > 0n) {
        reserveRatio = Number((totalReserves * 10000n) / totalAssets);
      }

      logger.info("Reserve ratio", {
        ratio: `${(reserveRatio / 100).toFixed(2)}%`,
      });

      // Step 5: Check if update needed
      const currentReserves = getCurrentReserves(runtime);
      const diff =
        totalReserves > currentReserves
          ? totalReserves - currentReserves
          : currentReserves - totalReserves;

      if (diff < 1000000n) {
        // Less than 1 USDC difference
        logger.info("Reserve change too small, skipping update");
        return "No update needed";
      }

      // Step 6: Upload PoR report to IPFS
      const pinata = new PinataClient(
        runtime,
        runtime.config.pinataApiKey,
        runtime.config.pinataApiSecret,
      );

      const ipfsHash = await pinata.uploadReserveReport({
        timestamp: Date.now(),
        totalReserves: `$${reservesInUSDC.toLocaleString()} USDC`,
        onChainReserves: `$${balanceInUSDC.toLocaleString()} USDC`,
        custodianReserves: "$0 USDC",
        reserveRatio: `${(reserveRatio / 100).toFixed(2)}%`,
        attestations: [{ source: "On-chain USDC balance", verified: true }],
      });

      logger.success("PoR report uploaded to IPFS", { ipfsHash });

      // Step 7: Update ProofOfReserveOracle
      const txHash = updateReserves(runtime, totalReserves, ipfsHash);

      logger.success("✅ Proof of Reserve Verification Complete", {
        txHash,
        ipfsHash,
        reserveRatio: `${(reserveRatio / 100).toFixed(2)}%`,
      });

      return txHash;
    },
    { operation: "Proof of Reserve Verification", runtime },
  );
};

/**
 * Cron trigger handler
 */
const onCronTrigger = async (
  runtime: Runtime<Config>,
  payload: CronPayload,
): Promise<string> => {
  runtime.log("⏰ Cron triggered - starting PoR verification");
  return runProofOfReserveWorkflow(runtime);
};

/**
 * Initialize workflow
 */
const initWorkflow = (config: Config) => {
  const cronTrigger = new CronCapability();

  return [
    handler(
      cronTrigger.trigger({
        schedule: config.schedule,
      }),
      onCronTrigger,
    ),
  ];
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
