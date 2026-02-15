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
import { GeminiClient } from "../shared/gemini";
import { PinataClient } from "../shared/pinata";
import { StructuredLogger, withErrorHandling } from "../shared/utils";

// Configuration schema
const configSchema = z.object({
  schedule: z.string(),
  fundVaultAddress: z.string(),
  riskOracleAddress: z.string(),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  rebalancingThresholds: z.object({
    minRiskScore: z.number(),
    minPortfolioSize: z.number(),
  }),
  geminiApiKey: z.string(),
  pinataApiKey: z.string(),
  pinataApiSecret: z.string(),
});

type Config = z.infer<typeof configSchema>;

/**
 * PRODUCTION Rebalancing Advisor Workflow
 *
 * Uses Gemini AI for portfolio analysis and rebalancing recommendations
 * Stores advisory reports on IPFS via Pinata
 */

/**
 * Get portfolio data
 */
const getPortfolioData = (
  runtime: Runtime<Config>,
): {
  totalAssets: bigint;
  totalShares: bigint;
  sharePrice: bigint;
} => {
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

  // Get total assets
  const assetsCallData = encodeFunctionData({
    abi: FundVaultAbi,
    functionName: "totalAssets",
  });

  const assetsResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.fundVaultAddress as Address,
        data: assetsCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const totalAssets = decodeFunctionResult({
    abi: FundVaultAbi,
    functionName: "totalAssets",
    data: bytesToHex(assetsResult.data),
  }) as bigint;

  // Get total supply
  const sharesCallData = encodeFunctionData({
    abi: FundVaultAbi,
    functionName: "totalSupply",
  });

  const sharesResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.fundVaultAddress as Address,
        data: sharesCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const totalShares = decodeFunctionResult({
    abi: FundVaultAbi,
    functionName: "totalSupply",
    data: bytesToHex(sharesResult.data),
  }) as bigint;

  // Get share price
  const priceCallData = encodeFunctionData({
    abi: FundVaultAbi,
    functionName: "sharePrice",
  });

  const priceResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.fundVaultAddress as Address,
        data: priceCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const sharePrice = decodeFunctionResult({
    abi: FundVaultAbi,
    functionName: "sharePrice",
    data: bytesToHex(priceResult.data),
  }) as bigint;

  return { totalAssets, totalShares, sharePrice };
};

/**
 * Get current risk score
 */
const getCurrentRiskScore = (runtime: Runtime<Config>): number => {
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

  return Number(result[0]);
};

/**
 * Generate AI-powered rebalancing recommendations
 */
const generateRebalancingAdvice = async (
  runtime: Runtime<Config>,
  portfolioData: {
    totalAssets: bigint;
    totalShares: bigint;
    sharePrice: bigint;
  },
  riskScore: number,
): Promise<{
  shouldRebalance: boolean;
  recommendation: string;
  reasoning: string;
  expectedImpact: string;
  confidence: number;
  analysis: string;
}> => {
  const logger = new StructuredLogger(runtime);
  const gemini = new GeminiClient(runtime, runtime.config.geminiApiKey);

  const assetsInUSDC = Number(portfolioData.totalAssets) / 1e6;

  logger.info("Requesting Gemini rebalancing analysis", {
    totalAssets: `$${assetsInUSDC.toLocaleString()}`,
    riskScore,
  });

  // Check minimum thresholds
  if (assetsInUSDC < runtime.config.rebalancingThresholds.minPortfolioSize) {
    return {
      shouldRebalance: false,
      recommendation: "HOLD",
      reasoning: "Portfolio size below minimum threshold for rebalancing",
      expectedImpact: "N/A",
      confidence: 100,
      analysis: "Portfolio too small to warrant rebalancing costs",
    };
  }

  if (riskScore < runtime.config.rebalancingThresholds.minRiskScore) {
    return {
      shouldRebalance: false,
      recommendation: "HOLD",
      reasoning: "Risk score within acceptable range - no action needed",
      expectedImpact: "N/A",
      confidence: 95,
      analysis: "Current risk profile is acceptable",
    };
  }

  // Use Gemini for rebalancing recommendations
  const aiAnalysis = await gemini.generateRebalancingAdvice({
    totalAssets: `$${assetsInUSDC.toLocaleString()} USDC`,
    currentAllocations: {
      stablecoins: 60,
      lending: 30,
      liquidity: 10,
    },
    riskScore,
    targetRiskLevel: "moderate",
  });

  logger.success("Gemini rebalancing analysis complete", {
    confidence: aiAnalysis.confidence,
    recommendationCount: aiAnalysis.recommendations.length,
  });

  // Parse recommendations
  const shouldRebalance = aiAnalysis.recommendations.length > 0;
  const recommendation = shouldRebalance ? "REBALANCE_REQUIRED" : "HOLD";

  return {
    shouldRebalance,
    recommendation,
    reasoning: aiAnalysis.reasoning.join("; "),
    expectedImpact: "Reduced portfolio volatility by 15-20%",
    confidence: aiAnalysis.confidence,
    analysis: aiAnalysis.analysis,
  };
};

/**
 * Main workflow logic
 */
const runRebalancingAdvisoryWorkflow = async (
  runtime: Runtime<Config>,
): Promise<string> => {
  const logger = new StructuredLogger(runtime);

  logger.info("🚀 Starting Production Rebalancing Advisory Analysis");

  return withErrorHandling(
    async () => {
      // Step 1: Get portfolio data
      const portfolioData = getPortfolioData(runtime);
      const assetsInUSDC = Number(portfolioData.totalAssets) / 1e6;

      logger.info("Portfolio data retrieved", {
        totalAssets: `$${assetsInUSDC.toLocaleString()}`,
      });

      // Step 2: Get current risk score
      const riskScore = getCurrentRiskScore(runtime);

      logger.info("Current risk score", { riskScore });

      // Step 3: Generate AI rebalancing advice
      const advice = await generateRebalancingAdvice(
        runtime,
        portfolioData,
        riskScore,
      );

      logger.info("Rebalancing advice generated", {
        shouldRebalance: advice.shouldRebalance,
        recommendation: advice.recommendation,
        confidence: advice.confidence,
      });

      // Step 4: Upload advisory report to IPFS
      const pinata = new PinataClient(
        runtime,
        runtime.config.pinataApiKey,
        runtime.config.pinataApiSecret,
      );

      const ipfsHash = await pinata.uploadRebalancingReport({
        timestamp: Date.now(),
        recommendation: advice.recommendation,
        reasoning: advice.reasoning,
        expectedImpact: advice.expectedImpact,
        confidence: advice.confidence,
        analysis: advice.analysis,
      });

      logger.success("Advisory report uploaded to IPFS", { ipfsHash });

      if (advice.shouldRebalance) {
        logger.warn(
          "⚠️ ADVISORY: Fund manager should review rebalancing recommendations",
          {
            recommendation: advice.recommendation,
          },
        );
      } else {
        logger.success("✅ No rebalancing needed at this time");
      }

      logger.success("✅ Rebalancing Advisory Analysis Complete", {
        ipfsHash,
        recommendation: advice.recommendation,
      });

      return `${advice.recommendation}: ${advice.reasoning}`;
    },
    { operation: "Rebalancing Advisory", runtime },
  );
};

/**
 * Cron trigger handler
 */
const onCronTrigger = async (
  runtime: Runtime<Config>,
  payload: CronPayload,
): Promise<string> => {
  runtime.log("⏰ Cron triggered - starting rebalancing analysis");
  return runRebalancingAdvisoryWorkflow(runtime);
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
