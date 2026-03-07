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
type EVMChain = z.infer<typeof evmChainSchema>;

/**
 * PRODUCTION Portfolio Health Monitoring Workflow
 *
 * Uses Gemini AI for comprehensive risk analysis and Firebase Firestore for report storage
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
 * Get current risk score from RiskOracle on a specific chain
 */
const getCurrentRiskScore = (
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
  }) as readonly [number, bigint, string];

  return BigInt(result[0]);
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
 * Update RiskOracle with new score on a specific chain
 */
const updateRiskOracle = (
  runtime: Runtime<Config>,
  chain: EVMChain,
  newRiskScore: number,
  ipfsHash: string,
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

  logger.info(`Updating RiskOracle on ${chain.chainName}`, {
    newRiskScore,
    ipfsHash,
  });

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
      receiver: chain.riskOracleAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: chain.gasLimit,
      },
    })
    .result();

  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update RiskOracle on ${chain.chainName}: ${resp.errorMessage || resp.txStatus}`,
    );
  }

  const txHash = bytesToHex(resp.txHash || new Uint8Array(32));
  logger.success(`RiskOracle updated on ${chain.chainName}`, { txHash });

  return txHash;
};

/**
 * Main workflow logic — aggregates data across all chains
 */
const runPortfolioHealthWorkflow = async (
  runtime: Runtime<Config>,
): Promise<string> => {
  const logger = new StructuredLogger(runtime);

  logger.info(
    `🚀 Starting Multi-chain Portfolio Health Monitoring (${runtime.config.evms.length} chains)`,
  );

  return withErrorHandling(
    async () => {
      // Step 1: Read portfolio data from ALL chains
      let aggregatedTotalAssets = BigInt(0);
      let weightedRiskScore = BigInt(0);
      const chainData: {
        chain: EVMChain;
        totalAssets: bigint;
        riskScore: bigint;
      }[] = [];

      for (const chain of runtime.config.evms) {
        const totalAssets = getTotalAssets(runtime, chain);
        const riskScore = getCurrentRiskScore(runtime, chain);

        chainData.push({ chain, totalAssets, riskScore });
        aggregatedTotalAssets += totalAssets;
        weightedRiskScore += riskScore * totalAssets;

        logger.info(`Chain ${chain.chainName} data`, {
          totalAssets: `$${(Number(totalAssets) / 1e6).toLocaleString()}`,
          riskScore: Number(riskScore),
        });
      }

      // Weighted average risk score based on TVL per chain
      const currentScore =
        aggregatedTotalAssets > BigInt(0)
          ? weightedRiskScore / aggregatedTotalAssets
          : BigInt(0);

      logger.info("Aggregated portfolio data", {
        totalAssets: `$${(Number(aggregatedTotalAssets) / 1e6).toLocaleString()}`,
        weightedRiskScore: Number(currentScore),
        chains: runtime.config.evms.length,
      });

      // Step 2: Calculate new risk score using Gemini AI
      const riskAnalysis = calculateRiskScore(runtime, {
        totalAssets: aggregatedTotalAssets,
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
        totalAssets: `$${Number(aggregatedTotalAssets) / 1e6}`,
        analysis: riskAnalysis.analysis,
        recommendations: riskAnalysis.recommendations,
        chains: chainData.map((cd) => ({
          chainName: cd.chain.chainName,
          totalAssets: `$${Number(cd.totalAssets) / 1e6}`,
          riskScore: Number(cd.riskScore),
        })),
      });

      logger.success("Risk report uploaded to Firebase", { ipfsHash });

      // Step 5: Update RiskOracle on ALL chains
      const txHashes: string[] = [];
      for (const chain of runtime.config.evms) {
        const txHash = updateRiskOracle(
          runtime,
          chain,
          riskAnalysis.riskScore,
          ipfsHash,
        );
        txHashes.push(txHash);
      }

      logger.success("✅ Multi-chain Portfolio Health Monitoring Complete", {
        txHashes,
        ipfsHash,
        newRiskScore: riskAnalysis.riskScore,
        chainsUpdated: runtime.config.evms.length,
      });

      return txHashes.join(",");
    },
    { operation: "Portfolio Health Monitoring", runtime },
  );
};

/**
 * ABI for the AnalysisRequested event
 */
const eventAbi = parseAbi([
  "event AnalysisRequested(address indexed requester, uint256 timestamp)",
]);
const eventSignature = "AnalysisRequested(address,uint256)";

/**
 * Log trigger handler — runs when AnalysisRequested is emitted on-chain
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
    `AnalysisRequested by ${decodedLog.args.requester} at ${decodedLog.args.timestamp}`,
  );

  return runPortfolioHealthWorkflow(runtime);
};

/**
 * Initialize workflow — listens for AnalysisRequested events from FundVault on ALL chains
 */
const initWorkflow = (config: Config) => {
  const analysisEventHash = keccak256(toHex(eventSignature));
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
          topics: [{ values: [analysisEventHash] }],
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
