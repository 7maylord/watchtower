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
import { FundVaultAbi, RiskOracleAbi } from "../contracts/abi";

// Configuration schema
const configSchema = z.object({
  schedule: z.string(),
  fundVaultAddress: z.string(),
  riskOracleAddress: z.string(),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  riskThresholds: z.object({
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    critical: z.number(),
  }),
});

type Config = z.infer<typeof configSchema>;

// Utility function to safely stringify objects with bigints
const safeJsonStringify = (obj: any): string =>
  JSON.stringify(
    obj,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );

/**
 * Read total assets from FundVault contract
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

  // Encode the contract call for totalAssets()
  const callData = encodeFunctionData({
    abi: FundVaultAbi,
    functionName: "totalAssets",
  });

  runtime.log("📊 Fetching total assets from FundVault...");

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

  // Decode the result
  const totalAssets = decodeFunctionResult({
    abi: FundVaultAbi,
    functionName: "totalAssets",
    data: bytesToHex(contractCall.data),
  });

  return totalAssets;
};

/**
 * Read current risk score from RiskOracle
 */
const getCurrentRiskScore = (runtime: Runtime<Config>): bigint => {
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
    abi: RiskOracleAbi,
    functionName: "getCurrentRiskScore",
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.riskOracleAddress as Address,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const result = decodeFunctionResult({
    abi: RiskOracleAbi,
    functionName: "getCurrentRiskScore",
    data: bytesToHex(contractCall.data),
  }) as readonly [bigint, bigint, string];

  return result[0]; // Return only the score (uint256 = bigint)
};

/**
 * Calculate risk score based on portfolio metrics
 *
 * For now, thisimplementation uses a simple heuristic:
 * - Low risk (0-30): Small portfolio size (<  $10k USDC)
 * - Medium risk (31-50): Medium portfolio ($10k-$100k)
 * - High risk (51-70): Large portfolio ($100k-$1M)
 * - Critical risk (71-100): Very large (>$1M) or other risk factors
 *
 * TODO: In production, this should integrate:
 * - DeFi protocol health APIs (Aave, Compound)
 * - AI model for risk analysis (Claude/GPT)
 * - Market volatility indicators
 * - Counterparty risk metrics
 */
const calculateRiskScore = (
  runtime: Runtime<Config>,
  totalAssets: bigint,
): number => {
  // Convert from 6 decimals (USDC) to human-readable
  const assetsInUSDC = Number(totalAssets) / 1e6;

  runtime.log(`💰 Portfolio size: $${assetsInUSDC.toLocaleString()} USDC`);

  // Simple risk calculation based on portfolio size
  let riskScore: number;

  if (assetsInUSDC < 10000) {
    // Small portfolio: low risk
    riskScore = 20;
  } else if (assetsInUSDC < 100000) {
    // Medium portfolio: moderate risk
    riskScore = 40;
  } else if (assetsInUSDC < 1000000) {
    // Large portfolio: elevated risk
    riskScore = 60;
  } else {
    // Very large portfolio: high risk
    riskScore = 75;
  }

  // TODO: Add additional risk factors here:
  // - Protocol health scores
  // - Market volatility
  // - Concentration risk
  // - AI-based predictions

  runtime.log(`📈 Calculated risk score: ${riskScore}/100`);

  return riskScore;
};

/**
 * Update RiskOracle with new risk score
 */
const updateRiskOracle = (
  runtime: Runtime<Config>,
  riskScore: number,
  ipfsHash: string,
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

  runtime.log(
    `🔄 Updating RiskOracle with score: ${riskScore}, hash: ${ipfsHash}`,
  );

  // Encode the contract call for updateRiskScore(uint256 newScore, string memory reportHash)
  const callData = encodeFunctionData({
    abi: RiskOracleAbi,
    functionName: "updateRiskScore",
    args: [BigInt(riskScore), ipfsHash],
  });

  // Generate report using consensus capability
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
      receiver: runtime.config.riskOracleAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  const txStatus = resp.txStatus;

  if (txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update RiskOracle: ${resp.errorMessage || txStatus}`,
    );
  }

  const txHash = resp.txHash || new Uint8Array(32);

  runtime.log(`✅ RiskOracle updated! TxHash: ${bytesToHex(txHash)}`);

  return bytesToHex(txHash);
};

/**
 * Main workflow logic: Portfolio Health Monitoring
 */
const monitorPortfolioHealth = (runtime: Runtime<Config>): string => {
  runtime.log("🚀 Starting Portfolio Health Monitoring...");

  // Step 1: Read total assets from FundVault
  const totalAssets = getTotalAssets(runtime);

  // Step 2: Get current risk score
  const currentScore = getCurrentRiskScore(runtime);
  runtime.log(`📊 Current risk score: ${currentScore}`);

  // Step 3: Calculate new risk score based on portfolio metrics
  const newRiskScore = calculateRiskScore(runtime, totalAssets);

  // Step 4: Check if update is needed (only update if score changed by >= 5 points)
  const scoreDiff = Math.abs(Number(currentScore) - newRiskScore);

  if (scoreDiff < 5) {
    runtime.log(`⏭️  Score change too small (${scoreDiff}), skipping update`);
    return `No update needed. Current: ${currentScore}, New: ${newRiskScore}`;
  }

  // Step 5: Generate IPFS hash for detailed report
  // TODO: In production, upload detailed risk analysis to IPFS
  const ipfsHash = `QmRiskReport${newRiskScore}`; // Placeholder hash

  // Step 6: Update RiskOracle
  const txHash = updateRiskOracle(runtime, newRiskScore, ipfsHash);

  runtime.log("✅ Portfolio Health Monitoring Complete!");

  return txHash;
};

/**
 * Handle cron trigger
 */
const onCronTrigger = (
  runtime: Runtime<Config>,
  payload: CronPayload,
): string => {
  runtime.log(`⏰ Cron triggered - starting portfolio health check`);

  return monitorPortfolioHealth(runtime);
};

/**
 * Initialize workflow with cron trigger
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
