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
  aiModel: z.object({
    provider: z.string(),
    enabled: z.boolean(),
  }),
  rebalancingThresholds: z.object({
    minRiskScore: z.number(),
    minPortfolioSize: z.number(),
  }),
});

type Config = z.infer<typeof configSchema>;

/**
 * Rebalancing Advisor Workflow
 *
 * This workflow generates AI-powered portfolio rebalancing recommendations:
 * 1. Reads current portfolio state from FundVault
 * 2. Fetches current risk score from RiskOracle
 * 3. Analyzes market conditions and risk factors
 * 4. Generates rebalancing recommendations using AI (Claude/GPT)
 * 5. Emits advisory event (does NOT execute rebalancing automatically)
 *
 * NOTE: This is an ADVISORY workflow only. Fund managers must manually
 * approve and execute any rebalancing actions.
 */

// Utility function to safely stringify objects with bigints
const safeJsonStringify = (obj: any): string =>
  JSON.stringify(
    obj,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );

/**
 * Get portfolio data from FundVault
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

  // Get total supply (shares)
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
 * Get current risk score from RiskOracle
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

  return Number(result[0]); // Return score as number
};

/**
 * Generate AI-powered rebalancing recommendations
 *
 * TODO: In production, integrate with:
 * - Anthropic Claude API for portfolio analysis
 * - OpenAI GPT-4 for market insights
 * - Historical performance data
 * - DeFi protocol APY comparisons
 * - Risk-adjusted return calculations
 */
const generateRebalancingAdvice = (
  runtime: Runtime<Config>,
  portfolioData: {
    totalAssets: bigint;
    totalShares: bigint;
    sharePrice: bigint;
  },
  riskScore: number,
): { shouldRebalance: boolean; recommendation: string; reasoning: string } => {
  const assetsInUSDC = Number(portfolioData.totalAssets) / 1e6;

  runtime.log(
    `📊 Analyzing portfolio: $${assetsInUSDC.toLocaleString()} USDC, Risk: ${riskScore}/100`,
  );

  // Check if portfolio meets minimum thresholds
  if (assetsInUSDC < runtime.config.rebalancingThresholds.minPortfolioSize) {
    return {
      shouldRebalance: false,
      recommendation: "HOLD",
      reasoning: "Portfolio size below minimum threshold for rebalancing",
    };
  }

  if (riskScore < runtime.config.rebalancingThresholds.minRiskScore) {
    return {
      shouldRebalance: false,
      recommendation: "HOLD",
      reasoning: "Risk score within acceptable range - no action needed",
    };
  }

  // Simple heuristic for demo
  // In production, this would call Claude/GPT with detailed market analysis
  if (riskScore >= 70) {
    return {
      shouldRebalance: true,
      recommendation: "REDUCE_EXPOSURE",
      reasoning:
        "High risk detected - recommend reducing volatile positions and increasing stablecoin allocation",
    };
  }

  if (riskScore >= 50) {
    return {
      shouldRebalance: true,
      recommendation: "MODERATE_ADJUSTMENT",
      reasoning:
        "Moderate risk - recommend rebalancing to target allocation ratios",
    };
  }

  return {
    shouldRebalance: false,
    recommendation: "HOLD",
    reasoning: "Portfolio balanced - maintain current allocation",
  };
};

/**
 * Main workflow logic: Rebalancing Advisory
 */
const generateRebalancingAdvisory = (runtime: Runtime<Config>): string => {
  runtime.log("🚀 Starting Rebalancing Advisory Analysis...");

  // Step 1: Get portfolio data
  const portfolioData = getPortfolioData(runtime);
  const assetsInUSDC = Number(portfolioData.totalAssets) / 1e6;
  runtime.log(`💰 Portfolio: $${assetsInUSDC.toLocaleString()} USDC`);

  // Step 2: Get current risk score
  const riskScore = getCurrentRiskScore(runtime);
  runtime.log(`📈 Risk Score: ${riskScore}/100`);

  // Step 3: Generate AI recommendations
  const advice = generateRebalancingAdvice(runtime, portfolioData, riskScore);

  runtime.log(`🤖 AI Recommendation: ${advice.recommendation}`);
  runtime.log(`📝 Reasoning: ${advice.reasoning}`);

  if (advice.shouldRebalance) {
    runtime.log(
      `⚠️  ADVISORY: Fund manager should review and consider rebalancing`,
    );
    runtime.log(`📋 Action: ${advice.recommendation}`);
  } else {
    runtime.log(`✅ No rebalancing needed at this time`);
  }

  runtime.log("✅ Rebalancing Advisory Analysis Complete!");

  // Return advisory summary
  return `${advice.recommendation}: ${advice.reasoning}`;
};

/**
 * Handle cron trigger
 */
const onCronTrigger = (
  runtime: Runtime<Config>,
  payload: CronPayload,
): string => {
  runtime.log(`⏰ Cron triggered - starting rebalancing analysis`);
  return generateRebalancingAdvisory(runtime);
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
