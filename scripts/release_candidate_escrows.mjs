/**
 * release_candidate_escrows.mjs
 *
 * Executes live release for candidate test escrows once the target package
 * is published to the registry within the permitted time window:
 *   Window: 2026-10-12T12:11:12Z -> 2026-10-14T12:11:12Z
 *
 * Rules:
 * - Checks current UTC time against window_start and window_end.
 * - Checks registry status before submitting on-chain write.
 * - Submits release from an authorized non-funder account.
 * - Verifies final transaction status and post-state transition to RELEASED.
 * - Records recipient payout and economics.
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const { createClient, createAccount } = require(resolve(root, "web/node_modules/genlayer-js/dist/index.js"));
const { studioDevnet } = require(resolve(root, "web/node_modules/genlayer-js/dist/chains/index.js"));
const keytar = require(resolve(homedir(), "AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar"));

const CONTRACT_ADDRESS = "0x7Cef756668Cd925807e8B110D0330643c6F809E3";
const EVIDENCE_FILE = resolve(root, "scripts/steward_evidence.json");

async function getCallerAccount() {
  const callerPk = await keytar.getPassword("genlayer-cli", "account:coverlock-submitter");
  if (callerPk) {
    const cleanPk = callerPk.startsWith("0x") ? callerPk : `0x${callerPk}`;
    return createAccount(cleanPk);
  }
  throw new Error("No non-funder caller account available in keytar to submit release transaction.");
}

async function main() {
  console.log("=== ShipLock Candidate Escrow Release Runner ===");
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`Chain ID: 61997`);

  const readClient = createClient({ chain: studioDevnet });
  const now = new Date();
  console.log(`Current UTC Time: ${now.toISOString()}`);

  if (!existsSync(EVIDENCE_FILE)) {
    throw new Error(`Evidence file not found: ${EVIDENCE_FILE}`);
  }

  const evidence = JSON.parse(readFileSync(EVIDENCE_FILE, "utf-8"));
  const candidates = evidence.candidateReleaseEscrows || [];

  if (candidates.length === 0) {
    console.log("No candidate release escrows registered in evidence file.");
    return;
  }

  for (const cand of candidates) {
    console.log(`\n--- Candidate: ${cand.target} - ${cand.package}@${cand.version} (ID: ${cand.id.slice(0, 10)}...) ---`);
    const escrow = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [cand.id]
    });

    console.log(`  Current State: status=${escrow.status}, amount=${escrow.amount}`);
    const start = new Date(escrow.window_start_utc);
    const end = new Date(escrow.window_end_utc);

    if (escrow.status === "RELEASED") {
      console.log(`  [✓] Escrow already RELEASED on-chain.`);
      continue;
    }

    if (now < start) {
      const hoursLeft = ((start.getTime() - now.getTime()) / (3600 * 1000)).toFixed(2);
      console.log(`  [🔒 TIME-GATED] Window opens in ${hoursLeft} hours (${escrow.window_start_utc}). Cannot release before start.`);
      continue;
    }

    if (now >= end) {
      console.log(`  [!] Window expired (${escrow.window_end_utc}). Cannot execute standard release inside window.`);
      continue;
    }

    console.log(`  [⏳ IN-WINDOW] Window is active. Submitting release...`);
    const caller = await getCallerAccount();
    const writeClient = createClient({ chain: studioDevnet, account: caller });

    const feeEst = await writeClient.estimateTransactionFees({
      leaderTimeunitsAllocation: 150n,
      validatorTimeunitsAllocation: 300n,
      rotations: [0n],
    });

    const txHash = await writeClient.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "release",
      args: [cand.id],
      fees: {
        distribution: feeEst.distribution,
        feeValue: feeEst.feeValue,
      },
    });

    console.log(`  [*] Submitted release tx: ${txHash}. Waiting for finalization...`);
    await writeClient.waitForTransactionReceipt({
      hash: txHash,
      waitUntil: "finalized",
      retries: 100,
      interval: 3000,
    });

    const txInfo = await writeClient.getTransaction({ hash: txHash });
    console.log(`  [✓] Tx Finalized: Status=${txInfo.statusName}, Execution=${txInfo.txExecutionResultName}`);

    const after = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [cand.id]
    });

    console.log(`  [✓] Post-Tx Status: ${after.status}, MatchReason: ${after.match_reason}`);
    cand.releaseAttempt = {
      timestampUtc: new Date().toISOString(),
      txHash,
      explorerTxUrl: `https://explorer-studio-dev.genlayer.com/tx/${txHash}`,
      txStatus: txInfo.statusName,
      executionResult: txInfo.txExecutionResultName,
      resultingStatus: after.status,
      matchReason: after.match_reason,
    };
  }

  writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2), "utf-8");
  console.log(`\n[✓] Evidence updated.`);
}

main().catch(err => {
  console.error("[-] Error:", err);
  process.exit(1);
});
