import {
  createClient,
  isSuccessful,
  encodeExternalMessageFeeParams,
  deriveExternalMessageCallKey,
  MESSAGE_ALLOCATION_ROOT_PARENT_INDEX,
} from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { CONTRACT_ADDRESS, CHAIN_ID } from "./env";
import feeProfile from "../fee-profile.json";

export function assertAddress(addr: string | undefined | null, label: string) {
  if (!addr) throw new Error(label + " missing");
  const cleaned = addr.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(cleaned)) throw new Error(label + " invalid");
  return cleaned as `0x${string}`;
}

function profileFor(functionName: string) {
  const methods = feeProfile.methods || {};
  const entry =
    (methods as any)[functionName] ||
    (methods as any).fund_escrow ||
    (methods as any).release ||
    (methods as any).cancel ||
    (methods as any).deploy;
  if (!entry) throw new Error("no fee-profile entry for " + functionName);
  return entry;
}

export const MIN_PHASE_TIMEOUT = 30n;
export const MAX_PHASE_TIMEOUT = 600n;

export const TRANSFER_METHODS = new Set(["cancel", "release", "expire", "withdraw"]);

export function validatePhaseAllocations(distribution: {
  leaderTimeunitsAllocation?: string | number | bigint;
  validatorTimeunitsAllocation?: string | number | bigint;
  [key: string]: any;
}): void {
  if (!distribution) {
    throw new Error("Missing fee distribution to validate phase timeouts");
  }
  const leader = BigInt(distribution.leaderTimeunitsAllocation ?? 0);
  const validator = BigInt(distribution.validatorTimeunitsAllocation ?? 0);

  if (leader < MIN_PHASE_TIMEOUT || leader > MAX_PHASE_TIMEOUT) {
    throw new Error(
      `Leader phase allocation (${leader}) out of bounds: must be between ${MIN_PHASE_TIMEOUT} and ${MAX_PHASE_TIMEOUT} timeunits`
    );
  }
  if (validator < MIN_PHASE_TIMEOUT || validator > MAX_PHASE_TIMEOUT) {
    throw new Error(
      `Validator phase allocation (${validator}) out of bounds: must be between ${MIN_PHASE_TIMEOUT} and ${MAX_PHASE_TIMEOUT} timeunits`
    );
  }
}

export function buildReleaseMessageAllocations({
  recipient,
  funder,
  budget = 150000000000000n,
  gasLimit = 500000n,
  maxGasPrice = 300000000n,
}: {
  recipient: string;
  funder: string;
  budget?: bigint;
  gasLimit?: bigint;
  maxGasPrice?: bigint;
}) {
  const rClean = assertAddress(recipient, "escrow.recipient");
  const fClean = assertAddress(funder, "escrow.funder");
  const feeParams = encodeExternalMessageFeeParams({ gasLimit, maxGasPrice });
  const callKey = deriveExternalMessageCallKey();

  const recipientNode = {
    messageType: 0,
    onAcceptance: false,
    parentIndex: MESSAGE_ALLOCATION_ROOT_PARENT_INDEX,
    recipient: rClean,
    callKey,
    budget,
    feeParams,
  };

  if (rClean.toLowerCase() === fClean.toLowerCase()) {
    return [recipientNode];
  }

  const funderNode = {
    messageType: 0,
    onAcceptance: false,
    parentIndex: MESSAGE_ALLOCATION_ROOT_PARENT_INDEX,
    recipient: fClean,
    callKey,
    budget,
    feeParams,
  };

  return [recipientNode, funderNode];
}

export function validateTransferAllocations({
  functionName,
  distribution,
  messageAllocations,
  mustHaveTransfer = false,
  expectedRecipients = [],
}: {
  functionName: string;
  distribution?: any;
  messageAllocations?: any[];
  mustHaveTransfer?: boolean;
  expectedRecipients?: string[];
}): void {
  const totalMessageFees = BigInt(distribution?.totalMessageFees ?? 0);
  const hasAllocations = Array.isArray(messageAllocations) && messageAllocations.length > 0;

  // Nonzero totalMessageFees with an empty allocation tree is invalid
  if (totalMessageFees > 0n && !hasAllocations) {
    throw new Error(
      `Invalid fee parameters for ${functionName}: nonzero totalMessageFees (${totalMessageFees}) requires a non-empty messageAllocations tree.`
    );
  }

  // If function is release, an empty allocation tree is strictly unsafe and rejected before sending
  if (functionName === "release" && !hasAllocations) {
    throw new Error(
      `Fee estimation produced an unsafe empty allocation tree for transfer in release. A release transaction must cover both recipient payout and funder refund to protect against cross-boundary execution. Aborting before wallet signing.`
    );
  }

  // If a transfer is mandatory for this call (cancel, expire, withdraw, release):
  if (mustHaveTransfer && !hasAllocations) {
    throw new Error(
      `Fee estimation cannot produce a valid message allocation for transfer in ${functionName}. Aborting before wallet signing.`
    );
  }

  if (hasAllocations) {
    let sumBudgets = 0n;
    const recipientsInAllocations = new Set<string>();

    for (let i = 0; i < messageAllocations!.length; i++) {
      const alloc = messageAllocations![i];
      if (
        !alloc ||
        !alloc.recipient ||
        typeof alloc.recipient !== "string" ||
        !/^0x[0-9a-fA-F]{40}$/.test(alloc.recipient.trim())
      ) {
        throw new Error(`Message allocation at index ${i} has invalid recipient: ${alloc?.recipient}`);
      }
      recipientsInAllocations.add(alloc.recipient.trim().toLowerCase());
      if (BigInt(alloc.budget ?? 0) <= 0n) {
        throw new Error(`Message allocation at index ${i} has non-positive budget: ${alloc?.budget}`);
      }

      const parentIdx =
        alloc.parentIndex !== undefined
          ? BigInt(alloc.parentIndex)
          : MESSAGE_ALLOCATION_ROOT_PARENT_INDEX;
      if (parentIdx === MESSAGE_ALLOCATION_ROOT_PARENT_INDEX) {
        sumBudgets += BigInt(alloc.budget);
      }
    }

    if (
      distribution?.totalMessageFees !== undefined &&
      BigInt(distribution.totalMessageFees) !== sumBudgets
    ) {
      throw new Error(
        `Distribution totalMessageFees (${distribution.totalMessageFees}) does not match sum of root message allocations (${sumBudgets})`
      );
    }

    if (Array.isArray(expectedRecipients) && expectedRecipients.length > 0) {
      for (const expected of expectedRecipients) {
        const cleanExpected = assertAddress(expected, "expected recipient").toLowerCase();
        if (!recipientsInAllocations.has(cleanExpected)) {
          throw new Error(
            `Release message allocations missing required recipient ${expected}. Both recipient payout and funder refund allocations are required to protect against cross-boundary execution. Aborting before wallet signing.`
          );
        }
      }
    }
  }
}

export function isTemporaryNetworkOrTransportError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const name = (err instanceof Error ? err.name : (err as any)?.name || "").toLowerCase();
  const code = (err as any)?.code ? String((err as any).code).toUpperCase() : "";

  const transportCodes = [
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
  ];
  if (transportCodes.includes(code)) return true;

  if (name === "aborterror" || name === "timeouterror") return true;

  if (
    msg.includes("fetch failed") ||
    msg.includes("network error") ||
    msg.includes("network request failed") ||
    msg.includes("network timeout") ||
    msg.includes("connection refused") ||
    msg.includes("connection reset") ||
    msg.includes("socket hang up") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("gateway timeout") ||
    msg.includes("502 bad gateway") ||
    msg.includes("503 service unavailable") ||
    msg.includes("504 gateway timeout") ||
    msg.includes("failed to fetch")
  ) {
    return true;
  }

  return false;
}

export function safeJsonStringify(obj: unknown, space: number = 2): string {
  return JSON.stringify(
    obj,
    (_key, val) => (typeof val === "bigint" ? val.toString() : val),
    space
  );
}

export async function writeIc({
  account,
  provider,
  functionName,
  args,
  value,
  onProgress,
  client: injectedClient,
  transactionKit: injectedKit,
}: {
  account: string | undefined | null;
  provider: any;
  functionName: string;
  args: any[];
  value?: bigint;
  onProgress?: (stage: string, extra?: any) => void;
  client?: any;
  transactionKit?: any;
}) {
  const contract = assertAddress(CONTRACT_ADDRESS, "contract");
  const wallet = assertAddress(account, "wallet");
  
  if (CHAIN_ID !== 61997) {
    throw new Error("switch to Studio Next (Chain ID 61997)");
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === undefined) {
      throw new Error(`Argument at index ${i} is undefined`);
    }
  }

  if (!provider && !injectedClient) {
    throw new Error("no wallet provider");
  }
  
  const client = injectedClient ?? createClient({
    chain: studioDevnet,
    account: wallet,
    provider: provider
  });

  onProgress?.("ESTIMATING FEES");

  let distribution: any;
  let feeValue: bigint = 0n;
  let messageAllocations: any = undefined;

  const prof = profileFor(functionName);
  const leaderAlloc = BigInt(prof.leaderTimeunitsAllocation ?? "200");
  const validatorAlloc = BigInt(prof.validatorTimeunitsAllocation ?? "400");
  validatePhaseAllocations({
    leaderTimeunitsAllocation: leaderAlloc,
    validatorTimeunitsAllocation: validatorAlloc,
  });

  const isTransferCall = TRANSFER_METHODS.has(functionName);

  let quote: any = null;
  if (injectedKit) {
    try {
      quote = await injectedKit.estimate(
        { preset: "standard", userValue: value ?? 0n },
        { kind: "write", address: contract, method: functionName, args }
      );
    } catch (kitErr: any) {
      if (isTemporaryNetworkOrTransportError(kitErr)) {
        console.warn("TransactionKit estimate fallback (temporary network/transport failure):", kitErr);
      } else {
        throw kitErr;
      }
    }
  }

  if (quote) {
    if (quote.verification?.status === "mismatch") {
      throw new Error(
        `Fee policy verification mismatch: quote fee config hash ${quote.verification.actualHash ?? "actual"} does not match expected ${quote.verification.expectedHash ?? "expected"}. Aborting transaction.`
      );
    }
    distribution = quote.distribution;
    feeValue = quote.feeValue;
    messageAllocations = quote.messageAllocations;
  }

  let expectedRecipients: string[] | undefined = undefined;

  // Handle release transactions specially:
  // Consensus could reach recipient payout (200), early 404 (0 messages), or funder refund (cross-boundary / expired).
  // A pre-submit simulation may observe early 404 and return no messageAllocations (or incomplete quote).
  // We must make every release transaction safe for each outcome it could reach during consensus.
  if (functionName === "release") {
    const escrowId = args[0];
    if (!escrowId) throw new Error("Escrow ID missing for release");

    let escrow: any = null;
    try {
      escrow = await client.readContract({
        address: contract,
        functionName: "get_escrow",
        args: [escrowId],
      });
    } catch (readErr: any) {
      throw new Error(
        `Failed to read escrow ${escrowId} for release fee configuration: ${readErr?.message || readErr}. Aborting before wallet signing.`
      );
    }
    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    const recipient = assertAddress(escrow.recipient, "escrow.recipient");
    const funder = assertAddress(escrow.funder, "escrow.funder");
    expectedRecipients = recipient.toLowerCase() === funder.toLowerCase() ? [recipient] : [recipient, funder];

    // If a quote was provided, check if it already safely covers both recipients.
    // If quote is missing or empty (e.g. simulation observed early 404 branch and returned no allocations)
    // or does not cover both recipients, build complete allocation tree and compute authoritative fee quote.
    const quoteHasBothRecipients =
      Array.isArray(messageAllocations) &&
      messageAllocations.length > 0 &&
      expectedRecipients.every((r) =>
        messageAllocations.some((m: any) => m?.recipient?.toLowerCase() === r.toLowerCase())
      );

    if (!quoteHasBothRecipients) {
      const completeAllocations = buildReleaseMessageAllocations({ recipient, funder });
      try {
        const est = await client.estimateTransactionFees({
          leaderTimeunitsAllocation: leaderAlloc,
          validatorTimeunitsAllocation: validatorAlloc,
          rotations: [BigInt(prof.rotationsPerRound ?? "1")],
          messageAllocations: completeAllocations,
        });
        distribution = est.distribution;
        feeValue = est.feeValue;
        messageAllocations = est.messageAllocations;
      } catch (estErr: any) {
        throw new Error(
          `Fee estimation cannot produce or validate fee configuration covering release transfer: ${estErr?.message || estErr}. Aborting before wallet signing.`
        );
      }
    }
  } else {
    // For non-release transfer calls or regular calls:
    // Use client.estimateTransactionFeesForWrite (Studio simulation / supported estimation):
    // Required whenever messageAllocations is missing for a transfer call, or when quote wasn't provided
    if (!distribution || (isTransferCall && (!messageAllocations || messageAllocations.length === 0))) {
      if (typeof client?.estimateTransactionFeesForWrite === "function") {
        try {
          const callerAccount = { address: wallet };
          const writeEst = await client.estimateTransactionFeesForWrite({
            account: callerAccount,
            address: contract,
            functionName,
            args,
            value: value ?? 0n,
            leaderTimeunitsAllocation: leaderAlloc,
            validatorTimeunitsAllocation: validatorAlloc,
            rotations: [BigInt(prof.rotationsPerRound ?? "1")],
          });
          distribution = writeEst.distribution;
          feeValue = writeEst.feeValue;
          messageAllocations = writeEst.messageAllocations;
        } catch (estErr: any) {
          if (isTransferCall) {
            // If estimation cannot produce a valid allocation for a transfer, stop before wallet signing; never silently use the generic fallback
            throw new Error(
              `Fee estimation cannot produce a valid message allocation for transfer in ${functionName}: ${estErr.message || estErr}. Aborting before wallet signing.`
            );
          }
          if (isTemporaryNetworkOrTransportError(estErr)) {
            console.warn("estimateTransactionFeesForWrite network fallback:", estErr);
          } else {
            throw estErr;
          }
        }
      }
    }

    // Generic fallback: ONLY allowed for non-transfer calls on temporary network error
    if (!distribution) {
      if (isTransferCall) {
        throw new Error(
          `Fee estimation cannot produce a valid message allocation for transfer in ${functionName}. Aborting before wallet signing.`
        );
      }
      const fallbackEst = await client.estimateTransactionFees({
        leaderTimeunitsAllocation: leaderAlloc,
        validatorTimeunitsAllocation: validatorAlloc,
        rotations: [BigInt(prof.rotationsPerRound ?? "1")],
      });
      distribution = fallbackEst.distribution;
      feeValue = fallbackEst.feeValue;
      messageAllocations = fallbackEst.messageAllocations;
    }
  }

  // Validate phase allocation bounds (30-600) before wallet signing or transaction submission
  validatePhaseAllocations(distribution);

  // Validate transfer message allocations before wallet signing
  const mustHaveTransfer = ["cancel", "release", "expire", "withdraw"].includes(functionName);
  validateTransferAllocations({
    functionName,
    distribution,
    messageAllocations,
    mustHaveTransfer,
    expectedRecipients,
  });

  const preWriteLog = {
    wallet,
    contract,
    functionName,
    args,
    value: String(value ?? 0n),
    argTypes: args.map(a => typeof a + ":" + String(a)),
    clientAccount: client?.account ?? null,
  };
  
  console.log("Pre-write log:", safeJsonStringify(preWriteLog));

  if ((wallet as any) === "undefined" || wallet === undefined) throw new Error("wallet");
  if ((contract as any) === "undefined" || contract === undefined) throw new Error("contract");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "undefined" || args[i] === undefined) throw new Error(`args[${i}]`);
  }

  onProgress?.("SIGN IN WALLET");

  const txId = await client.writeContract({
    address: contract,
    functionName,
    args,
    value: value ?? 0n,
    fees: {
      distribution,
      messageAllocations,
      feeValue,
    },
  });

  onProgress?.("SUBMITTED", { hash: txId });

  let tx: any;
  try {
    if ((client as any).waitForDecision) {
      tx = await (client as any).waitForDecision({ hash: txId });
    } else if (client.waitForFinalization) {
      tx = await client.waitForFinalization({ hash: txId });
    } else if (client.waitForTransactionReceipt) {
      tx = await client.waitForTransactionReceipt({
        hash: txId,
        status: "FINALIZED" as any,
        retries: 80,
        interval: 4000,
      });
    } else {
      let attempts = 0;
      for (;;) {
        if (attempts > 45) {
          throw new Error("Transaction polling timed out after 3 minutes");
        }
        try {
          tx = await client.getTransaction({ hash: txId });
          const status = tx?.statusName || tx?.status;
          const exec = tx?.txExecutionResultName || tx?.executionResultName || tx?.txExecutionResult;
          const isFinal = status === 'ACCEPTED' || status === 'FINALIZED' || status === 5 || status === 7;
          
          const hasConfirmedExec =
            (typeof (client as any).isSuccessful === "function" && (client as any).isSuccessful(tx)) ||
            (typeof isSuccessful === "function" && isSuccessful(tx)) ||
            (exec && (String(exec) === "FINISHED_WITH_RETURN" || String(exec).includes("FINISHED_WITH_RETURN")));

          if (tx && (status === 'FINALIZED' || status === 7)) {
            break;
          }
          if (tx && status === 'ACCEPTED' && hasConfirmedExec) {
            break;
          }
          if (tx && isFinal && exec && !hasConfirmedExec) {
            break;
          }
        } catch {
          // ignore not found and retry
        }
        
        onProgress?.("WAITING", { hash: txId, status: tx?.statusName || tx?.status || 'PENDING' });
        await new Promise((r) => setTimeout(r, 4000));
        attempts++;
      }
    }
  } catch (e: any) {
    try {
      tx = await client.getTransaction({ hash: txId });
      const txAny = tx as any;
      const status = txAny?.statusName || txAny?.status;
      const exec = txAny?.txExecutionResultName || txAny?.executionResultName || txAny?.txExecutionResult;
      const isFinal = status === 'ACCEPTED' || status === 'FINALIZED' || status === 5 || status === 7;
      const hasConfirmedExec =
        (typeof (client as any).isSuccessful === "function" && (client as any).isSuccessful(tx)) ||
        (typeof isSuccessful === "function" && isSuccessful(tx)) ||
        (exec && (String(exec) === "FINISHED_WITH_RETURN" || String(exec).includes("FINISHED_WITH_RETURN")));
      if (!tx || !isFinal || !hasConfirmedExec) {
        throw e;
      }
    } catch {
      onProgress?.("FAILED", { hash: txId, error: String(e) });
      throw e;
    }
  }

  const txAny = tx as any;
  const status = txAny?.statusName || txAny?.status;
  const exec = txAny?.txExecutionResultName || txAny?.executionResultName || txAny?.txExecutionResult;
  
  onProgress?.("WAITING", { hash: txId, status, exec });
  
  const isAcceptedOrFinalized =
    status === "ACCEPTED" || status === "FINALIZED" || status === 5 || status === 7;

  const isExecutionSuccessful =
    (typeof (client as any).isSuccessful === "function" && (client as any).isSuccessful(tx)) ||
    (typeof isSuccessful === "function" && isSuccessful(tx)) ||
    (exec !== undefined && exec !== null && (String(exec) === "FINISHED_WITH_RETURN" || String(exec).includes("FINISHED_WITH_RETURN")));

  if (!isAcceptedOrFinalized || !isExecutionSuccessful) {
    let errText = `Transaction execution not successful: status=${status} / exec=${exec ?? "missing_execution"}`;
    if (isAcceptedOrFinalized && (!exec || exec === "null" || exec === "undefined")) {
      errText = `Transaction ${status} but missing confirmed execution evidence`;
    } else {
      try {
        const leader = txAny?.consensus_data?.leader_receipt?.[0];
        const stderr = leader?.genvm_result?.stderr;
        const errorDesc = leader?.genvm_result?.error_description || txAny?.error_description;
        if (stderr) {
          const lines = String(stderr).trim().split("\n");
          errText = lines[lines.length - 1];
        } else if (errorDesc) {
          errText = String(errorDesc);
        }
      } catch {
        // keep default errText
      }
    }
    onProgress?.("FAILED", { hash: txId, status, exec, error: errText });
    throw new Error(errText);
  }

  // Keep derived ID canonical: ignore fields that are not documented as contract return values
  const returnedId = txAny?.returnValue ? String(txAny.returnValue).trim() : null;
  return { txId, returnedId, status, exec, tx: txAny };
}

export interface VerifyCreatedEscrowOptions {
  client: any;
  contractAddress: string;
  expectedId: string;
  returnedId?: unknown;
  funder: string;
  recipient: string;
  template: string;
  packageName: string;
  version: string;
  amountWei: bigint | string;
  nonce: bigint | string;
  policy?: string;
  expectedRepo?: string;
  expectedTag?: string;
  maxAttempts?: number;
  intervalMs?: number;
}

/**
 * Validates lock submission candidate ID and verifies on-chain get_escrow before navigating.
 * Accepts returnedId only if valid 0x + 64-hex equal to expected derived ID; otherwise reports mismatch.
 * Confirms exact ID, funder, recipient, template, package, version, amount, nonce, and policy metadata.
 */
export async function verifyCreatedEscrow({
  client,
  contractAddress,
  expectedId,
  returnedId,
  funder,
  recipient,
  template,
  packageName,
  version,
  amountWei,
  nonce,
  policy,
  expectedRepo,
  expectedTag,
  maxAttempts = 10,
  intervalMs = 1000,
}: VerifyCreatedEscrowOptions) {
  if (returnedId !== null && returnedId !== undefined) {
    const returnedStr = String(returnedId).trim();
    const isValidHex64 = /^0x[0-9a-fA-F]{64}$/.test(returnedStr);
    if (!isValidHex64 || returnedStr.toLowerCase() !== expectedId.toLowerCase()) {
      throw new Error(
        `Escrow ID mismatch: transaction receipt exposed "${returnedStr}", but expected derived ID "${expectedId}".`
      );
    }
  }

  const expectedLower = expectedId.toLowerCase();
  const funderLower = funder.trim().toLowerCase();
  const recipientLower = recipient.trim().toLowerCase();
  const expectedAmount = BigInt(amountWei);
  const expectedNonce = BigInt(nonce);

  let verifiedEscrow: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const e = await client.readContract({
        address: contractAddress,
        functionName: "get_escrow",
        args: [expectedId],
      });

      if (e) {
        const idMatches = (e.id ? String(e.id) : expectedId).toLowerCase() === expectedLower;
        const statusMatches = e.status === "OPEN";
        const funderMatches = String(e.funder || "").toLowerCase() === funderLower;
        const recipientMatches = String(e.recipient || "").toLowerCase() === recipientLower;
        const templateMatches = String(e.template || "").trim() === template.trim();
        const pkgMatches = String(e.package_name || "").trim() === packageName.trim();
        const verMatches = String(e.version || "").trim() === version.trim();
        const amountMatches = BigInt(e.amount ?? 0) === expectedAmount;
        const nonceMatches = BigInt(e.nonce ?? 0) === expectedNonce;
        const policyMatches = !policy || String(e.policy || "REGISTRY_ONLY") === policy;
        const repoMatches = !expectedRepo || String(e.expected_repo || "").toLowerCase() === expectedRepo.trim().toLowerCase();
        const tagMatches = !expectedTag || String(e.expected_tag || "").trim() === expectedTag.trim();

        if (
          idMatches &&
          statusMatches &&
          funderMatches &&
          recipientMatches &&
          templateMatches &&
          pkgMatches &&
          verMatches &&
          amountMatches &&
          nonceMatches &&
          policyMatches &&
          repoMatches &&
          tagMatches
        ) {
          verifiedEscrow = e;
          break;
        }
      }
    } catch {
      // transient read failure, retry
    }

    if (attempt < maxAttempts - 1 && intervalMs > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  if (!verifiedEscrow) {
    throw new Error(
      `Escrow verification failed for "${expectedId}": on-chain get_escrow did not confirm matching parameters (status OPEN, funder, recipient, template, package, version, amount, nonce) within allotted attempts.`
    );
  }

  return verifiedEscrow;
}

