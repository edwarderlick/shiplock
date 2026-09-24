/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { createClient } from "genlayer-js";
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

export async function writeIc({
  account,
  provider,
  functionName,
  args,
  value,
  onProgress,
}: {
  account: string | undefined | null;
  provider: any;
  functionName: string;
  args: any[];
  value?: bigint;
  onProgress?: (stage: string, extra?: any) => void;
}) {
  const contract = assertAddress(CONTRACT_ADDRESS, "contract");
  const wallet = assertAddress(account, "wallet");
  
  if (CHAIN_ID !== 61997) {
      throw new Error("switch to Studio Next");
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === undefined) {
      throw new Error(`Argument at index ${i} is undefined`);
    }
  }

  if (!provider) {
    throw new Error("no wallet provider");
  }
  
  const client = createClient({
    chain: studioDevnet,
    account: wallet,
    provider: provider
  });

  onProgress?.("ESTIMATING FEES");

  const estimate = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 100n,
    validatorTimeunitsAllocation: 200n,
    rotations: [0n],
  });

  console.log("Full estimate:", JSON.stringify(estimate.distribution, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  const preWriteLog = {
    wallet,
    contract,
    functionName,
    args,
    value: String(value ?? 0n),
    argTypes: args.map(a => typeof a + ":" + String(a)),
    clientAccount: client?.account ?? null,
  };
  
  console.log("Pre-write log:", JSON.stringify(preWriteLog, null, 2));

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
      distribution: estimate.distribution,
      feeValue: estimate.feeValue,
    },
  });

  onProgress?.("SUBMITTED", { hash: txId });

  let tx;
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
          if (tx && status && (status === 'ACCEPTED' || status === 'FINALIZED' || status === 5 || status === 7)) {
            break;
          }
        } catch (e: any) {
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
      const exec = txAny?.txExecutionResultName || txAny?.executionResultName || txAny?.result || txAny?.execution_result;
      if (!tx || (status !== 'ACCEPTED' && status !== 'FINALIZED' && status !== 5 && status !== 7) || !String(exec).includes("FINISHED_WITH_RETURN")) {
        throw e;
      }
    } catch(fallbackErr) {
      onProgress?.("FAILED", { hash: txId, error: String(e) });
      throw e;
    }
  }

  const txAny = tx as any;
  const status = txAny.statusName || txAny.status;
  const exec = txAny.txExecutionResultName || txAny.executionResultName || txAny.result || txAny.execution_result;
  
  onProgress?.("WAITING", { hash: txId, status, exec });
  
  const ok =
    (typeof (client as any).isSuccessful === "function" && (client as any).isSuccessful(tx)) ||
    ((status === "ACCEPTED" || status === "FINALIZED" || status === 5 || status === 7)
    && String(exec).includes("FINISHED_WITH_RETURN"));

  if (!ok) {
    let errText = "tx not successful: " + status + " / " + exec;
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
    } catch(e) {}
    onProgress?.("FAILED", { hash: txId, status, exec, error: errText });
    throw new Error(errText);
  }

  const returnedId = txAny.returnValue || txAny.result || txAny.executionResult || txAny.data || null;
  return { txId, returnedId, status, exec };
}
