/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { createTransactionKit } from "@genlayer/transaction-kit";
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
  let feeValue: bigint;

  let quote: any = null;
  try {
    const kit = injectedKit ?? createTransactionKit({
      chain: studioDevnet,
      provider: provider ?? { request: async () => null },
      account: wallet,
      suggestions: feeProfile as any,
    });
    quote = await kit.estimate(
      { preset: "standard", userValue: value ?? 0n },
      { kind: "write", address: contract, method: functionName, args }
    );
  } catch (kitErr: any) {
    // Fail-closed: allow SDK estimate fallback ONLY for clearly identified temporary network/transport failures
    if (isTemporaryNetworkOrTransportError(kitErr)) {
      console.warn("TransactionKit estimate fallback (temporary network/transport failure):", kitErr);
    } else {
      // Propagate configuration, policy, verification, and unexpected errors
      throw kitErr;
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
  } else {
    // Network unavailable fallback: estimate via client
    const prof = profileFor(functionName);
    const fallbackEst = await client.estimateTransactionFees({
      leaderTimeunitsAllocation: BigInt(prof.leaderTimeunitsAllocation ?? "200"),
      validatorTimeunitsAllocation: BigInt(prof.validatorTimeunitsAllocation ?? "400"),
      rotations: [BigInt(prof.rotationsPerRound ?? "1")],
    });
    distribution = fallbackEst.distribution;
    feeValue = fallbackEst.feeValue;
  }

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
  maxAttempts?: number;
  intervalMs?: number;
}

/**
 * Validates lock submission candidate ID and verifies on-chain get_escrow before navigating.
 * Accepts returnedId only if valid 0x + 64-hex equal to expected derived ID; otherwise reports mismatch.
 * Confirms exact ID, funder, recipient, template, package, version, amount, and nonce (not status OPEN alone).
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

        if (
          idMatches &&
          statusMatches &&
          funderMatches &&
          recipientMatches &&
          templateMatches &&
          pkgMatches &&
          verMatches &&
          amountMatches &&
          nonceMatches
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

