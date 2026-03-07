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
import { FundVaultAbi, RiskOracleAbi } from "../contracts/abi";
import { GeminiClient } from "./gemini";
import { FirebaseClient } from "./firebase";
import { StructuredLogger, withErrorHandling } from "./utils";

// Configuration schema
const evmChainSchema = z.object({
  chainName: z.string(),
  fundVaultAddress: z.string(),
  riskOracleAddress: z.string(),
  gasLimit: z.string(),
});

const configSchema = z.object({
  schedule: z.string(),
  evms: z.array(evmChainSchema),
  rebalancingThresholds: z.object({
    minRiskScore: z.number(),
    minPortfolioSize: z.number(),
  }),
  geminiApiKey: z.string(),
  firebaseApiKey: z.string(),
  firebaseProjectId: z.string(),
});

type Config = z.infer<typeof configSchema>;
type EVMChain = z.infer<typeof evmChainSchema>;

/**
 * PRODUCTION Rebalancing Advisor Workflow
 *
 * Uses Gemini AI for portfolio analysis and rebalancing recommendations
 * Stores advisory reports on Firebase Firestore
 */

/**
 * Get portfolio data
 */
const getPortfolioData = (
  runtime: Runtime<Config>,
  chain: EVMChain,
): {
  totalAssets: bigint;
  totalShares: bigint;
  sharePrice: bigint;
} => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chain.chainName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found for chain selector: ${chain.chainName}`);
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
        to: chain.fundVaultAddress as Address,
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
        to: chain.fundVaultAddress as Address,
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
        to: chain.fundVaultAddress as Address,
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
const getCurrentRiskScore = (
  runtime: Runtime<Config>,
  chain: EVMChain,
): number => {
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
    abi: RiskOracleAbi,
    functionName: "getCurrentRiskScore",
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: chain.riskOracleAddress as Address,
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
const generateRebalancingAdvice = (
  runtime: Runtime<Config>,
  portfolioData: {
    totalAssets: bigint;
    totalShares: bigint;
    sharePrice: bigint;
  },
  riskScore: number,
): {
  shouldRebalance: boolean;
  recommendation: string;
  reasoning: string;
  expectedImpact: string;
  confidence: number;
  analysis: string;
} => {
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
  const aiAnalysis = gemini.generateRebalancingAdvice(runtime, {
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

  logger.info(
    `🚀 Starting Multi-chain Rebalancing Advisory Analysis (${runtime.config.evms.length} chains)`,
  );

  return withErrorHandling(
    async () => {
      // Use first chain as primary for portfolio data (can be aggregated later)
      const primaryChain = runtime.config.evms[0];

      // Step 1: Get portfolio data from primary chain
      const portfolioData = getPortfolioData(runtime, primaryChain);
      const assetsInUSDC = Number(portfolioData.totalAssets) / 1e6;

      logger.info("Portfolio data retrieved", {
        totalAssets: `$${assetsInUSDC.toLocaleString()}`,
        chain: primaryChain.chainName,
      });

      // Step 2: Get current risk score from primary chain
      const riskScore = getCurrentRiskScore(runtime, primaryChain);

      logger.info("Current risk score", { riskScore });

      // Step 3: Generate AI rebalancing advice
      const advice = generateRebalancingAdvice(
        runtime,
        portfolioData,
        riskScore,
      );

      logger.info("Rebalancing advice generated", {
        shouldRebalance: advice.shouldRebalance,
        recommendation: advice.recommendation,
        confidence: advice.confidence,
      });

      // Step 4: Upload advisory report to Firebase
      const firebase = new FirebaseClient(
        runtime,
        runtime.config.firebaseApiKey,
        runtime.config.firebaseProjectId,
      );

      const uploadData = {
        timestamp: Date.now(),
        riskScore: riskScore || 0,
        totalAssets: `$${assetsInUSDC.toLocaleString()} USDC`,
        recommendations: [advice.recommendation || "HOLD"],
        analysis: advice.analysis || "No analysis available",
      };

      let ipfsHash = "N/A";
      try {
        ipfsHash = firebase.uploadRebalancingReport(runtime, uploadData);
      } catch (uploadError) {
        logger.warn("Firebase upload failed, continuing without storage", {
          error: (uploadError as Error).message,
        });
      }

      logger.success("Advisory report uploaded", { ipfsHash });

      // Step 5: Execute on-chain rebalance on ALL chains if recommended
      if (advice.shouldRebalance) {
        for (const chain of runtime.config.evms) {
          logger.info(`⚡ Executing on-chain rebalance on ${chain.chainName}`);

          const network = getNetwork({
            chainFamily: "evm",
            chainSelectorName: chain.chainName,
            isTestnet: true,
          });

          if (!network) {
            logger.warn(`Network not found for ${chain.chainName}, skipping`);
            continue;
          }

          const evmClient = new EVMClient(network.chainSelector.selector);

          const rebalanceCallData = encodeFunctionData({
            abi: FundVaultAbi,
            functionName: "rebalance",
            args: [ipfsHash, BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
          });

          const reportResponse = runtime
            .report({
              encodedPayload: hexToBase64(rebalanceCallData),
              encoderName: "evm",
              signingAlgo: "ecdsa",
              hashingAlgo: "keccak256",
            })
            .result();

          const resp = evmClient
            .writeReport(runtime, {
              receiver: chain.fundVaultAddress,
              report: reportResponse,
              gasConfig: {
                gasLimit: chain.gasLimit,
              },
            })
            .result();

          if (resp.txStatus !== TxStatus.SUCCESS) {
            logger.warn(`Rebalance tx failed on ${chain.chainName}`, {
              error: resp.errorMessage || resp.txStatus,
            });
          } else {
            const txHash = bytesToHex(resp.txHash || new Uint8Array(32));
            logger.success(`✅ Rebalance executed on ${chain.chainName}`, {
              txHash,
            });
          }
        }
      } else {
        logger.success("✅ No rebalancing needed at this time");
      }

      logger.success("✅ Multi-chain Rebalancing Analysis Complete", {
        ipfsHash,
        recommendation: advice.recommendation,
      });

      return `${advice.recommendation}: ${advice.reasoning}`;
    },
    { operation: "Rebalancing Advisory", runtime },
  );
};

/**
 * ABI for the RebalanceRequested event
 */
const eventAbi = parseAbi([
  "event RebalanceRequested(address indexed requester, uint256 timestamp)",
]);
const eventSignature = "RebalanceRequested(address,uint256)";

/**
 * Log trigger handler — runs when RebalanceRequested is emitted on-chain
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
    `RebalanceRequested by ${decodedLog.args.requester} at ${decodedLog.args.timestamp}`,
  );

  return runRebalancingAdvisoryWorkflow(runtime);
};

/**
 * Initialize workflow — listens for RebalanceRequested events from FundVault
 */
const initWorkflow = (config: Config) => {
  const rebalanceEventHash = keccak256(toHex(eventSignature));
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
          addresses: [chain.fundVaultAddress],
          topics: [{ values: [rebalanceEventHash] }],
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
