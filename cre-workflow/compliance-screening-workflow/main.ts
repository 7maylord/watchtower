import {
  bytesToHex,
  type CronPayload,
  handler,
  CronCapability,
  EVMClient,
  type EVMLog,
  LogTriggerCapability,
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
  decodeEventLog,
} from "viem";
import { z } from "zod";
import { ComplianceRegistryAbi, FundVaultAbi } from "../contracts/abi";

// Configuration schema
const configSchema = z.object({
  schedule: z.string(),
  complianceRegistryAddress: z.string(),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  apiEndpoints: z.object({
    chainalysis: z.string(),
    ofacScreening: z.string(),
  }),
});

type Config = z.infer<typeof configSchema>;

/**
 * Compliance Screening Workflow
 *
 * This workflow monitors investor deposits and performs enhanced KYC/AML screening:
 * 1. Listens for Deposited events from FundVault
 * 2. Screens investor address against sanctions lists (OFAC, UN)
 * 3. Checks Chainalysis for on-chain risk indicators
 * 4. Updates ComplianceRegistry with screening results
 *
 * NOTE: In this demo, we'll use a simple cron-based approach
 * In production, use LogTrigger to react to Deposited events
 */

// Utility function to safely stringify objects with bigints
const safeJsonStringify = (obj: any): string =>
  JSON.stringify(
    obj,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );

/**
 * Check if address is compliant in the registry
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
 * Perform off-chain compliance screening
 *
 * TODO: In production, integrate with:
 * - Chainalysis KYT API
 * - OFAC Sanctions Screening API
 * - TRM Labs / Elliptic for transaction monitoring
 * - AI-based risk scoring (Claude/GPT for pattern analysis)
 */
const performOffChainScreening = (
  runtime: Runtime<Config>,
  investorAddress: Address,
): { shouldApprove: boolean; riskScore: number; reason: string } => {
  runtime.log(`🔍 Screening address: ${investorAddress}`);

  // Simple heuristic for demo purposes
  // In production, call actual compliance APIs here
  const addressLower = investorAddress.toLowerCase();

  // Check for known test addresses or patterns
  const isTestAddress =
    addressLower.includes("dead") || addressLower.includes("beef");

  if (isTestAddress) {
    runtime.log(`⚠️  Test address detected - flagging as high risk`);
    return {
      shouldApprove: false,
      riskScore: 85,
      reason: "Test address pattern detected",
    };
  }

  // Default: approve with low risk
  runtime.log(`✅ Address appears clean`);
  return {
    shouldApprove: true,
    riskScore: 10,
    reason: "No red flags detected",
  };
};

/**
 * Update compliance status in ComplianceRegistry
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

  runtime.log(
    `🔄 Updating compliance: ${investorAddress} | KYC: ${isKYCVerified} | Sanctioned: ${isSanctioned}`,
  );

  // Encode the contract call for updateCompliance(address investor, bool kycVerified, bool sanctioned)
  const callData = encodeFunctionData({
    abi: ComplianceRegistryAbi,
    functionName: "updateCompliance",
    args: [investorAddress, isKYCVerified, isSanctioned],
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
      receiver: runtime.config.complianceRegistryAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  const txStatus = resp.txStatus;

  if (txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update ComplianceRegistry: ${resp.errorMessage || txStatus}`,
    );
  }

  const txHash = resp.txHash || new Uint8Array(32);

  runtime.log(`✅ ComplianceRegistry updated! TxHash: ${bytesToHex(txHash)}`);

  return bytesToHex(txHash);
};

/**
 * Main workflow logic: Compliance Screening
 */
const performComplianceScreening = (runtime: Runtime<Config>): string => {
  runtime.log("🚀 Starting Compliance Screening...");

  // For demo purposes, screen a hardcoded test address
  // In production with LogTrigger, extract investor from Deposited event
  const testInvestor = "0x1234567890123456789012345678901234567890" as Address;

  runtime.log(`👤 Screening investor: ${testInvestor}`);

  // Step 1: Check current compliance status
  const currentStatus = getComplianceStatus(runtime, testInvestor);
  runtime.log(
    `📊 Current status: KYC=${currentStatus.isKYCVerified}, Sanctioned=${currentStatus.isSanctioned}`,
  );

  // Step 2: Perform off-chain compliance screening
  const screeningResult = performOffChainScreening(runtime, testInvestor);
  runtime.log(
    `📋 Screening result: ${screeningResult.reason} (risk: ${screeningResult.riskScore})`,
  );

  // Step 3: Determine new compliance status
  const shouldUpdate =
    currentStatus.isKYCVerified !== screeningResult.shouldApprove ||
    currentStatus.isSanctioned !== !screeningResult.shouldApprove;

  if (!shouldUpdate) {
    runtime.log(`⏭️  No update needed - status unchanged`);
    return "No update required";
  }

  // Step 4: Update ComplianceRegistry
  const txHash = updateComplianceStatus(
    runtime,
    testInvestor,
    screeningResult.shouldApprove, // KYC verified
    !screeningResult.shouldApprove, // Sanctioned (inverse of approval)
  );

  runtime.log("✅ Compliance Screening Complete!");

  return txHash;
};

/**
 * Handle cron trigger
 */
const onCronTrigger = (
  runtime: Runtime<Config>,
  payload: CronPayload,
): string => {
  runtime.log(`⏰ Cron triggered - starting compliance screening`);
  return performComplianceScreening(runtime);
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
