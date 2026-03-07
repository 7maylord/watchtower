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
import { ComplianceRegistryAbi } from "../contracts/abi";
import { ChainalysisClient } from "./chainalysis";
import { FirebaseClient } from "./firebase";
import { StructuredLogger, withErrorHandling } from "./utils";

// Configuration schema
const evmChainSchema = z.object({
  chainName: z.string(),
  complianceRegistryAddress: z.string(),
  gasLimit: z.string(),
});

const configSchema = z.object({
  schedule: z.string(),
  evms: z.array(evmChainSchema),
  chainalysisApiKey: z.string(),
  firebaseApiKey: z.string(),
  firebaseProjectId: z.string(),
});
type Config = z.infer<typeof configSchema>;
type EVMChain = z.infer<typeof evmChainSchema>;

/**
 * PRODUCTION Compliance Screening Workflow
 *
 * Performs comprehensive KYC/AML screening using:
 * - Chainalysis KYT for sanctions and risk assessment
 * - Firebase Firestore for audit trail storage
 * - On-chain ComplianceRegistry updates
 */

/**
 * Get compliance status from ComplianceRegistry
 */
const getComplianceStatus = (
  runtime: Runtime<Config>,
  chain: EVMChain,
  investorAddress: Address,
): { isKYCVerified: boolean; isSanctioned: boolean } => {
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
    abi: ComplianceRegistryAbi,
    functionName: "getComplianceStatus",
    args: [investorAddress],
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: chain.complianceRegistryAddress as Address,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const result = decodeFunctionResult({
    abi: ComplianceRegistryAbi,
    functionName: "getComplianceStatus",
    data: bytesToHex(contractCall.data),
  }) as readonly [boolean, boolean];

  return {
    isKYCVerified: result[0],
    isSanctioned: result[1],
  };
};

/**
 * Perform comprehensive compliance screening using Chainalysis
 */
const performComplianceScreening = async (
  runtime: Runtime<Config>,
  investorAddress: Address,
): Promise<{
  shouldApprove: boolean;
  riskScore: number;
  reason: string;
  ipfsHash: string;
}> => {
  const logger = new StructuredLogger(runtime);

  // Initialize API clients
  const chainalysis = new ChainalysisClient(
    runtime,
    runtime.config.chainalysisApiKey,
  );
  const firebase = new FirebaseClient(
    runtime,
    runtime.config.firebaseApiKey,
    runtime.config.firebaseProjectId,
  );

  logger.info("Starting Chainalysis screening", { address: investorAddress });

  // Screen address with Chainalysis
  const screeningResult = chainalysis.screenAddress(runtime, investorAddress);

  logger.info("Chainalysis screening complete", {
    address: investorAddress,
    isSanctioned: screeningResult.isSanctioned,
    riskScore: screeningResult.riskScore,
  });

  // Determine approval based on Chainalysis results
  const shouldApprove =
    !screeningResult.isSanctioned && screeningResult.riskScore < 50;

  // Upload detailed report to IPFS
  let ipfsHash = "N/A";
  try {
    ipfsHash = firebase.uploadComplianceReport(runtime, {
      timestamp: Date.now(),
      address: investorAddress,
      status: shouldApprove ? "APPROVED" : "REJECTED",
      riskScore: screeningResult.riskScore,
      screeningDetails: `Sanctioned: ${screeningResult.isSanctioned}, Confidence: ${screeningResult.confidence}`,
    });
    logger.success("Compliance report uploaded to Firebase", { ipfsHash });
  } catch (uploadError) {
    logger.warn("Firebase upload failed, continuing without storage", {
      error: (uploadError as Error).message,
    });
  }

  return {
    shouldApprove,
    riskScore: screeningResult.riskScore,
    reason: screeningResult.isSanctioned
      ? "Address flagged on sanctions list"
      : screeningResult.riskScore >= 50
        ? `High risk score: ${screeningResult.riskScore}/100`
        : "No compliance issues detected",
    ipfsHash,
  };
};

/**
 * Update ComplianceRegistry with screening results
 */
const updateComplianceStatus = (
  runtime: Runtime<Config>,
  chain: EVMChain,
  investorAddress: Address,
  isKYCVerified: boolean,
  isSanctioned: boolean,
): string => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chain.chainName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(
      `Network not found for chain selector: ${chain.chainName}`,
    );
  }

  const evmClient = new EVMClient(network.chainSelector.selector);
  const logger = new StructuredLogger(runtime);

  logger.info(`Updating ComplianceRegistry on ${chain.chainName}`, {
    address: investorAddress,
    kycVerified: isKYCVerified,
    sanctioned: isSanctioned,
  });

  const callData = encodeFunctionData({
    abi: ComplianceRegistryAbi,
    functionName: "updateCompliance",
    args: [investorAddress, isKYCVerified, isSanctioned],
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
      receiver: chain.complianceRegistryAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: chain.gasLimit,
      },
    })
    .result();

  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update ComplianceRegistry on ${chain.chainName}: ${resp.errorMessage || resp.txStatus}`,
    );
  }

  const txHash = bytesToHex(resp.txHash || new Uint8Array(32));
  logger.success(`ComplianceRegistry updated on ${chain.chainName}`, { txHash });

  return txHash;
};

/**
 * Main workflow logic
 */
const runComplianceWorkflow = async (
  runtime: Runtime<Config>,
): Promise<string> => {
  const logger = new StructuredLogger(runtime);

  logger.info("🚀 Starting Production Compliance Screening Workflow");

  // For demo: screen a test address
  // In production with LogTrigger: extract from Deposited event
  const testInvestor = "0x1234567890123456789012345678901234567890" as Address;

  return withErrorHandling(
    async () => {
      const primaryChain = runtime.config.evms[0];

      // Step 1: Check current status on primary chain
      const currentStatus = getComplianceStatus(runtime, primaryChain, testInvestor);
      logger.info("Current compliance status", currentStatus);

      // Step 2: Perform Chainalysis screening
      const screening = await performComplianceScreening(runtime, testInvestor);
      logger.info("Screening complete", {
        shouldApprove: screening.shouldApprove,
        riskScore: screening.riskScore,
        ipfsHash: screening.ipfsHash,
      });

      // Step 3: Check if update needed
      const needsUpdate =
        currentStatus.isKYCVerified !== screening.shouldApprove ||
        currentStatus.isSanctioned !== !screening.shouldApprove;

      if (!needsUpdate) {
        logger.info("No update needed - status unchanged");
        return "No update required";
      }

      // Step 4: Update ComplianceRegistry on ALL chains
      const txHashes: string[] = [];
      for (const chain of runtime.config.evms) {
        const txHash = updateComplianceStatus(
          runtime,
          chain,
          testInvestor,
          screening.shouldApprove,
          !screening.shouldApprove,
        );
        txHashes.push(txHash);
      }

      logger.success("✅ Compliance Screening Complete", {
        txHashes,
        ipfsHash: screening.ipfsHash,
        chainsUpdated: runtime.config.evms.length,
      });

      return txHashes.join(",");
    },
    { operation: "Compliance Screening", runtime },
  );
};

/**
 * ABI for the ComplianceScreeningRequested event
 */
const eventAbi = parseAbi([
  "event ComplianceScreeningRequested(address indexed requester, uint256 timestamp)",
]);
const eventSignature = "ComplianceScreeningRequested(address,uint256)";

/**
 * Log trigger handler — runs when ComplianceScreeningRequested is emitted
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
    `ComplianceScreeningRequested by ${decodedLog.args.requester} at ${decodedLog.args.timestamp}`,
  );

  return runComplianceWorkflow(runtime);
};

/**
 * Initialize workflow — listens for ComplianceScreeningRequested events
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
          addresses: [chain.complianceRegistryAddress],
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
