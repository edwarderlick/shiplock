import { isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import defaultFeeProfile from "../fee-profile.json";

export interface DeployFeeProfile {
  leaderTimeunitsAllocation?: string | number | bigint;
  validatorTimeunitsAllocation?: string | number | bigint;
  executionBudgetPerRound?: string | number | bigint;
  totalMessageFees?: string | number | bigint;
  rotationsPerRound?: string | number | bigint;
  rotations?: (string | number | bigint)[];
}

export function buildDeployFeeEstimateOptions(profileInput?: DeployFeeProfile) {
  const profile = profileInput ?? (defaultFeeProfile as any)?.deploy ?? {};
  const rotationsVal = profile.rotations ?? (profile.rotationsPerRound !== undefined ? [profile.rotationsPerRound] : ["1"]);
  const rotationsArray = Array.isArray(rotationsVal) ? rotationsVal.map((r: any) => BigInt(r)) : [BigInt(rotationsVal)];

  return {
    leaderTimeunitsAllocation: BigInt(profile.leaderTimeunitsAllocation ?? "125"),
    validatorTimeunitsAllocation: BigInt(profile.validatorTimeunitsAllocation ?? "250"),
    executionBudgetPerRound: BigInt(profile.executionBudgetPerRound ?? "25000000000000000"),
    totalMessageFees: BigInt(profile.totalMessageFees ?? "0"),
    rotations: rotationsArray,
  };
}

export function extractContractAddress(receipt: any): `0x${string}` {
  if (!receipt || typeof receipt !== "object") {
    throw new Error(`Deployment receipt is invalid or missing: ${JSON.stringify(receipt)}`);
  }

  // Candidate address sources mapped to their field names
  const candidateEntries: { field: string; raw: unknown }[] = [
    { field: "txDataDecoded.contractAddress", raw: receipt.txDataDecoded?.contractAddress },
    { field: "contract_address", raw: receipt.contract_address },
    { field: "data.contract_address", raw: receipt.data?.contract_address },
    { field: "contractAddress", raw: receipt.contractAddress },
    { field: "data.contractAddress", raw: receipt.data?.contractAddress },
    { field: "recipient", raw: receipt.recipient },
    { field: "data.recipient", raw: receipt.data?.recipient },
  ];

  const foundAddresses: { field: string; address: `0x${string}` }[] = [];

  for (const { field, raw } of candidateEntries) {
    if (typeof raw === "string" && raw.trim().length > 0) {
      const trimmed = raw.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        throw new Error(`Field '${field}' contains invalid contract address (expected 20-byte hex): "${trimmed}"`);
      }
      foundAddresses.push({ field, address: trimmed.toLowerCase() as `0x${string}` });
    }
  }

  if (foundAddresses.length === 0) {
    throw new Error("Deployment receipt does not contain a contract address.");
  }

  // Reject conflicting address fields
  const firstAddress = foundAddresses[0].address;
  for (let i = 1; i < foundAddresses.length; i++) {
    if (foundAddresses[i].address !== firstAddress) {
      throw new Error(
        `Conflicting contract address fields detected in receipt: '${foundAddresses[0].field}' (${firstAddress}) vs '${foundAddresses[i].field}' (${foundAddresses[i].address})`
      );
    }
  }

  // Prefer txDataDecoded.contractAddress if present, else agreed address
  const preferred = foundAddresses.find((entry) => entry.field === "txDataDecoded.contractAddress");
  return preferred ? preferred.address : firstAddress;
}

export function isDeploymentExecutionSuccessful(client: any, receipt: any): boolean {
  if (!receipt || typeof receipt !== "object") return false;

  // 1. Require FINALIZED status strictly
  const status = receipt.statusName ?? receipt.status;
  const isFinalized = status === "FINALIZED" || status === 7;
  if (!isFinalized) {
    return false;
  }

  // 2. Require SDK's confirmed successful execution result; fail closed if helper throws
  try {
    if (typeof client?.isSuccessful === "function") {
      return Boolean(client.isSuccessful(receipt));
    }
    if (typeof isSuccessful === "function") {
      return Boolean(isSuccessful(receipt));
    }
  } catch {
    // Fail closed if the helper throws
    return false;
  }

  // Fallback check if no SDK helper function was provided or imported
  const exec = receipt.txExecutionResultName ?? receipt.executionResultName ?? receipt.txExecutionResult;
  const isExecFinished =
    exec !== undefined &&
    exec !== null &&
    (String(exec) === "FINISHED_WITH_RETURN" || exec === 0);

  return Boolean(isExecFinished);
}

export interface DeployOptions {
  client: any;
  contractCode: string;
  feeProfile?: DeployFeeProfile;
  constructorArgs?: any[];
  onProgress?: (step: string, data?: any) => void;
}

export async function deployShipLockContract({
  client,
  contractCode,
  feeProfile,
  constructorArgs = [],
  onProgress,
}: DeployOptions) {
  if (!client) {
    throw new Error("GenLayer client is required for deployment.");
  }

  // 1. Validate chain selection
  const chainId = Number(client.chain?.id);
  if (chainId !== studioDevnet.id) {
    throw new Error(
      `Invalid chain selection: expected Studio Next (chainId ${studioDevnet.id}), received chainId ${chainId}.`
    );
  }

  if (!contractCode || contractCode.trim().length === 0) {
    throw new Error("Contract code cannot be empty.");
  }

  // 2. Estimate fees from profile
  onProgress?.("ESTIMATING_FEES");
  const estimateOptions = buildDeployFeeEstimateOptions(feeProfile);
  const feeEstimate = await client.estimateTransactionFees(estimateOptions);

  if (!feeEstimate || !feeEstimate.distribution || feeEstimate.feeValue === undefined) {
    throw new Error("Failed to estimate deployment fees from fee profile.");
  }

  // 3. Pass returned distribution and feeValue unchanged to deployContract
  onProgress?.("SUBMITTING_DEPLOYMENT", {
    distribution: feeEstimate.distribution,
    feeValue: feeEstimate.feeValue,
  });

  const txHash = await client.deployContract({
    code: contractCode,
    args: constructorArgs,
    fees: {
      distribution: feeEstimate.distribution,
      feeValue: feeEstimate.feeValue,
      ...(feeEstimate.messageAllocations ? { messageAllocations: feeEstimate.messageAllocations } : {}),
    },
  });

  if (!txHash) {
    throw new Error("deployContract did not return a transaction hash.");
  }

  onProgress?.("WAITING_FINALIZATION", { txHash });

  // 4. Wait for finalization
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
  });

  // 5. Require successful execution
  const success = isDeploymentExecutionSuccessful(client, receipt);
  if (!success) {
    const status = receipt?.statusName ?? receipt?.status;
    const exec = receipt?.txExecutionResultName ?? receipt?.txExecutionResult ?? "none";
    throw new Error(`Deployment transaction execution failed: status=${status}, executionResult=${exec}.`);
  }

  // 6. Extract and validate contract address
  const contractAddress = extractContractAddress(receipt);
  onProgress?.("DEPLOYMENT_SUCCESS", { contractAddress, txHash });

  return {
    txHash,
    contractAddress,
    receipt,
    feeEstimate,
  };
}
