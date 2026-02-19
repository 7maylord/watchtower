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
  cre,
} from "@chainlink/cre-sdk";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  zeroAddress,
} from "viem";
import { z } from "zod";
import { FundVaultAbi, RiskOracleAbi } from "../contracts/abi";
import { GeminiClient } from "./gemini";
import { FirebaseClient } from "./firebase";
import { StructuredLogger, withErrorHandling } from "./utils";

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
    updateThreshold: z.number(),
  }),
  geminiApiKey: z.string(),
  firebaseApiKey: z.string(),
  firebaseProjectId: z.string(),
});

type Config = z.infer<typeof configSchema>;

/**
 * PRODUCTION Portfolio Health Monitoring Workflow
 *
 * Uses Gemini AI for comprehensive risk analysis and Firebase Firestore for report storage
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
 * Get current risk score from RiskOracle
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

  return result[0];
};

/**
 * Calculate risk score using Gemini AI
 */
const calculateRiskScore = (
  runtime: Runtime<Config>,
  portfolioData: { totalAssets: bigint; currentRiskScore: bigint },
): {
  riskScore: number;
  analysis: string;
  recommendations: string[];
} => {
  const logger = new StructuredLogger(runtime);
  const gemini = new GeminiClient(runtime, runtime.config.geminiApiKey);

  const assetsInUSDC = Number(portfolioData.totalAssets) / 1e6;

  logger.info("Requesting Gemini AI risk analysis", {
    totalAssets: `$${assetsInUSDC.toLocaleString()}`,
    currentRiskScore: Number(portfolioData.currentRiskScore),
  });

  // Use Gemini for comprehensive risk analysis
  const geminiAnalysis = gemini.analyzePortfolioRisk(runtime, {
    totalAssets: `$${assetsInUSDC.toLocaleString()} USDC`,
    currentRiskScore: Number(portfolioData.currentRiskScore),
    marketConditions: "normal", // Could be enhanced with real market data
  });

  // Extract risk score from analysis
  const riskScore = extractRiskScoreFromAnalysis(
    geminiAnalysis.analysis,
    assetsInUSDC,
  );

  logger.success("Gemini analysis complete", {
    riskScore,
    confidence: geminiAnalysis.confidence,
    recommendationCount: geminiAnalysis.recommendations.length,
  });

  return {
    riskScore,
    analysis: geminiAnalysis.analysis,
    recommendations: geminiAnalysis.recommendations,
  };
};

/**
 * Extract risk score from Gemini's analysis
 */
function extractRiskScoreFromAnalysis(
  analysis: string,
  portfolioSize: number,
): number {
  // Look for explicit score in analysis
  const scoreMatch = analysis.match(
    /(?:risk\s+score|score)[:\s]+(\d+)(?:\/100)?/i,
  );
  if (scoreMatch) {
    return parseInt(scoreMatch[1]);
  }

  // Fallback: heuristic based on portfolio size
  if (portfolioSize === 0) return 20;
  if (portfolioSize < 10000) return 25;
  if (portfolioSize < 100000) return 35;
  if (portfolioSize < 1000000) return 45;
  return 55;
}

/**
 * Update RiskOracle with new score
 */
const updateRiskOracle = (
  runtime: Runtime<Config>,
  newRiskScore: number,
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
  const logger = new StructuredLogger(runtime);

  logger.info("Updating RiskOracle", { newRiskScore, ipfsHash });

  const callData = encodeFunctionData({
    abi: RiskOracleAbi,
    functionName: "updateRiskScore",
    args: [BigInt(newRiskScore), ipfsHash],
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
      receiver: runtime.config.riskOracleAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update RiskOracle: ${resp.errorMessage || resp.txStatus}`,
    );
  }

  const txHash = bytesToHex(resp.txHash || new Uint8Array(32));
  logger.success("RiskOracle updated", { txHash });

  return txHash;
};

/**
 * Main workflow logic
 */
const runPortfolioHealthWorkflow = async (
  runtime: Runtime<Config>,
): Promise<string> => {
  const logger = new StructuredLogger(runtime);

  logger.info("🚀 Starting Production Portfolio Health Monitoring");

  return withErrorHandling(
    async () => {
      // Step 1: Read portfolio data
      const totalAssets = getTotalAssets(runtime);
      const currentScore = getCurrentRiskScore(runtime);

      logger.info("Portfolio data retrieved", {
        totalAssets: `$${(Number(totalAssets) / 1e6).toLocaleString()}`,
        currentScore: Number(currentScore),
      });

      // Step 2: Calculate new risk score using Gemini AI
      const riskAnalysis = calculateRiskScore(runtime, {
        totalAssets,
        currentRiskScore: currentScore,
      });

      // Step 3: Check if update needed
      const scoreDiff = Math.abs(Number(currentScore) - riskAnalysis.riskScore);

      if (scoreDiff < runtime.config.riskThresholds.updateThreshold) {
        logger.info("Score change too small, skipping update", {
          diff: scoreDiff,
          threshold: runtime.config.riskThresholds.updateThreshold,
        });
        return "No update needed";
      }

      // Step 4: Upload detailed report to Firebase
      const firebase = new FirebaseClient(
        runtime,
        runtime.config.firebaseApiKey,
        runtime.config.firebaseProjectId,
      );

      const ipfsHash = firebase.uploadRiskReport(runtime, {
        timestamp: Date.now(),
        riskScore: riskAnalysis.riskScore,
        totalAssets: `$${Number(totalAssets) / 1e6}`,
        analysis: riskAnalysis.analysis,
        recommendations: riskAnalysis.recommendations,
      });

      logger.success("Risk report uploaded to Firebase", { ipfsHash });

      // Step 5: Update RiskOracle
      const txHash = updateRiskOracle(
        runtime,
        riskAnalysis.riskScore,
        ipfsHash,
      );

      logger.success("✅ Portfolio Health Monitoring Complete", {
        txHash,
        ipfsHash,
        newRiskScore: riskAnalysis.riskScore,
      });

      return txHash;
    },
    { operation: "Portfolio Health Monitoring", runtime },
  );
};

/**
 * Cron trigger handler
 */
const onCronTrigger = async (
  runtime: Runtime<Config>,
  payload: CronPayload,
): Promise<string> => {
  runtime.log("⏰ Cron triggered - starting portfolio health check");
  return runPortfolioHealthWorkflow(runtime);
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
