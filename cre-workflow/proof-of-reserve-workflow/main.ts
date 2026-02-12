import {
  bytesToHex,
  type CronPayload,
  handler,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  type HTTPSendRequester,
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

// Configuration schema
const configSchema = z.object({
  schedule: z.string(),
  proofOfReserveOracleAddress: z.string(),
  fundVaultAddress: z.string(),
  mockUSDCAddress: z.string(),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  custodianAPI: z.object({
    url: z.string(),
    enabled: z.boolean(),
  }),
});

type Config = z.infer<typeof configSchema>;

/**
 * Proof of Reserve Workflow
 *
 * This workflow verifies that the fund has sufficient reserves backing it:
 * 1. Reads total assets from FundVault
 * 2. Checks actual USDC balance in the vault
 * 3. Optionally queries custodian API for external holdings
 * 4. Calculates reserve ratio (actual reserves / total assets)
 * 5. Updates ProofOfReserveOracle with verification results
 */

// Utility function to safely stringify objects with bigints
const safeJsonStringify = (obj: any): string =>
  JSON.stringify(
    obj,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );

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

  // Call balanceOf on USDC contract
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
  }) as readonly [bigint, bigint, string];

  return result[0]; // Return total reserves
};

/**
 * Fetch reserves from custodian API (optional)
 *
 * TODO: In production, integrate with real custodian APIs:
 * - BitGo
 * - Fireblocks
 * - Copper
 * - Coinbase Custody
 */
const fetchCustodianReserves = (runtime: Runtime<Config>): bigint => {
  if (!runtime.config.custodianAPI.enabled) {
    runtime.log("📝 Custodian API disabled, using on-chain balance only");
    return 0n;
  }

  runtime.log(
    `📡 Fetching custodian reserves from: ${runtime.config.custodianAPI.url}`,
  );

  // TODO: Implement actual HTTP call to custodian API
  // For now, return 0
  return 0n;
};

/**
 * Update ProofOfReserveOracle with new reserve data
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

  runtime.log(
    `🔄 Updating ProofOfReserveOracle with reserves: ${totalReserves}`,
  );

  // Encode the contract call for updateReserves(uint256 newReserves, string memory reportHash)
  const callData = encodeFunctionData({
    abi: ProofOfReserveOracleAbi,
    functionName: "updateReserves",
    args: [totalReserves, reportHash],
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
      receiver: runtime.config.proofOfReserveOracleAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  const txStatus = resp.txStatus;

  if (txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `Failed to update ProofOfReserveOracle: ${resp.errorMessage || txStatus}`,
    );
  }

  const txHash = resp.txHash || new Uint8Array(32);

  runtime.log(`✅ ProofOfReserveOracle updated! TxHash: ${bytesToHex(txHash)}`);

  return bytesToHex(txHash);
};

/**
 * Main workflow logic: Proof of Reserve Verification
 */
const verifyProofOfReserve = (runtime: Runtime<Config>): string => {
  runtime.log("🚀 Starting Proof of Reserve Verification...");

  // Step 1: Read total assets from FundVault
  const totalAssets = getTotalAssets(runtime);
  const assetsInUSDC = Number(totalAssets) / 1e6;
  runtime.log(`📊 Total assets: $${assetsInUSDC.toLocaleString()} USDC`);

  // Step 2: Get actual USDC balance
  const actualBalance = getActualBalance(runtime);
  const balanceInUSDC = Number(actualBalance) / 1e6;
  runtime.log(`💰 Actual USDC balance: $${balanceInUSDC.toLocaleString()}`);

  // Step 3: Fetch custodian reserves (if enabled)
  const custodianReserves = fetchCustodianReserves(runtime);

  // Step 4: Calculate total reserves
  const totalReserves = actualBalance + custodianReserves;
  const reservesInUSDC = Number(totalReserves) / 1e6;
  runtime.log(`🏦 Total reserves: $${reservesInUSDC.toLocaleString()} USDC`);

  // Step 5: Calculate reserve ratio (in basis points)
  let reserveRatio = 10000; // 100% in basis points
  if (totalAssets > 0n) {
    reserveRatio = Number((totalReserves * 10000n) / totalAssets);
  }
  runtime.log(`📈 Reserve ratio: ${(reserveRatio / 100).toFixed(2)}%`);

  // Step 6: Check if update is needed
  const currentReserves = getCurrentReserves(runtime);
  const diff =
    totalReserves > currentReserves
      ? totalReserves - currentReserves
      : currentReserves - totalReserves;

  // Only update if difference is > 1 USDC
  if (diff < 1000000n) {
    runtime.log(`⏭️  Reserve change too small, skipping update`);
    return "No update needed";
  }

  // Step 7: Generate report hash
  const reportHash = `QmPoR${Number(totalReserves)}`;

  // Step 8: Update ProofOfReserveOracle
  const txHash = updateReserves(runtime, totalReserves, reportHash);

  runtime.log("✅ Proof of Reserve Verification Complete!");

  return txHash;
};

/**
 * Handle cron trigger
 */
const onCronTrigger = (
  runtime: Runtime<Config>,
  payload: CronPayload,
): string => {
  runtime.log(`⏰ Cron triggered - starting PoR verification`);
  return verifyProofOfReserve(runtime);
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
