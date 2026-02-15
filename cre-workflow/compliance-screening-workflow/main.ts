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
import { ComplianceRegistryAbi } from "../contracts/abi";
import { ChainalysisClient } from "./chainalysis";
import { PinataClient } from "./pinata";
import { StructuredLogger, withErrorHandling } from "./utils";

// Configuration schema
const configSchema = z.object({
  schedule: z.string(),
  complianceRegistryAddress: z.string(),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  chainalysisApiKey: z.string(),
  pinataApiKey: z.string(),
  pinataApiSecret: z.string(),
});
type Config = z.infer<typeof configSchema>;

/**
 * PRODUCTION Compliance Screening Workflow
 *
 * Performs comprehensive KYC/AML screening using:
 * - Chainalysis KYT for sanctions and risk assessment
 * - IPFS (Pinata) for audit trail storage
 * - On-chain ComplianceRegistry updates
 */

/**
 * Get compliance status from ComplianceRegistry
 */
const getComplianceStatus = (
  runtime: Runtime<Config>,
  investorAddress: Address,
): { isKYCVerified: boolean; isSanctioned: boolean } => {
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
    abi: ComplianceRegistryAbi,
    functionName: "getComplianceStatus",
    args: [investorAddress],
  });

  const contractCall = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.complianceRegistryAddress as Address,
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
  const pinata = new PinataClient(
    runtime,
    runtime.config.pinataApiKey,
    runtime.config.pinataApiSecret,
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
    ipfsHash = pinata.uploadComplianceReport(runtime, {
      timestamp: Date.now(),
      address: investorAddress,
      status: shouldApprove ? "APPROVED" : "REJECTED",
      riskScore: screeningResult.riskScore,
      screeningDetails: `Sanctioned: ${screeningResult.isSanctioned}, Confidence: ${screeningResult.confidence}`,
    });
    logger.success("Compliance report uploaded to IPFS", { ipfsHash });
  } catch (uploadError) {
    logger.warn("Pinata upload failed, continuing without IPFS", {
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
  investorAddress: Address,
  isKYCVerified: boolean,
  isSanctioned: boolean,
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

  logger.info("Updating ComplianceRegistry", {
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
      receiver: runtime.config.complianceRegistryAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (resp.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update ComplianceRegistry: ${resp.errorMessage || resp.txStatus}`,
    );
  }

  const txHash = bytesToHex(resp.txHash || new Uint8Array(32));
  logger.success("ComplianceRegistry updated", { txHash });

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
      // Step 1: Check current status
      const currentStatus = getComplianceStatus(runtime, testInvestor);
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

      // Step 4: Update ComplianceRegistry
      const txHash = updateComplianceStatus(
        runtime,
        testInvestor,
        screening.shouldApprove,
        !screening.shouldApprove,
      );

      logger.success("✅ Compliance Screening Complete", {
        txHash,
        ipfsHash: screening.ipfsHash,
      });

      return txHash;
    },
    { operation: "Compliance Screening", runtime },
  );
};

/**
 * Cron trigger handler
 */
const onCronTrigger = async (
  runtime: Runtime<Config>,
  payload: CronPayload,
): Promise<string> => {
  runtime.log("⏰ Cron triggered - starting compliance screening");
  return runComplianceWorkflow(runtime);
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
