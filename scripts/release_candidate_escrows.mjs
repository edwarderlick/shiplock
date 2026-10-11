/**
 * release_candidate_escrows.mjs
 *
 * Fail-closed, crash-resilient runner for ShipLock's candidate release escrows on GenLayer Studio Next.
 *
 * Timing rules matching contracts/shiplock.py:
 * - Start:  window_start_utc (earliest allowed release call)
 * - End:    window_end_utc (publication deadline)
 * - Expire: expire_at_utc = window_end_utc + 7 days
 *
 * Requirements:
 * 1. Reconcile any pending transaction before applying current registry or time gates.
 * 2. Submit only when the exact version has trustworthy evidence of publication inside the escrow window and is not yanked.
 * 3. For missing, inconclusive, yanked, or out-of-window evidence, record the finding and stop without a write.
 * 4. Persist the pre-transaction escrow/economics baseline snapshot before submitting and alongside the pending hash.
 * 5. On restart, reconcile that same baseline with the finalized transaction and post-state.
 * 6. Never set verified=true unless finalized execution, RELEASED/200_IN_WINDOW, exact payout, and economics all pass.
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  atomicWriteJson,
  readJsonSafe,
  reconcilePendingTransaction,
  executeWithBaselineSnapshot,
  queryRegistryMetadata,
  parseUtcIso,
} from "./evidence_helper.mjs";

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

  const evidence = readJsonSafe(EVIDENCE_FILE);
  if (!evidence) {
    throw new Error(`Evidence file not found: ${EVIDENCE_FILE}`);
  }

  const saveEvidence = () => {
    atomicWriteJson(EVIDENCE_FILE, evidence);
  };

  const candidates = evidence.candidateReleaseEscrows || [];
  if (candidates.length === 0) {
    console.log("No candidate release escrows registered in evidence file.");
    return;
  }

  for (const cand of candidates) {
    console.log(`\n--- Candidate: ${cand.target} - ${cand.package}@${cand.version} (ID: ${cand.id.slice(0, 10)}...) ---`);

    // 1. RECONCILE PENDING TRANSACTION FIRST (before registry checks or time gates)
    if (cand.releaseAttempt?.txHash && !cand.releaseAttempt?.verified) {
      console.log(`  [🔍 RECOVERY] Found unverified pending release attempt (${cand.releaseAttempt.txHash}). Reconciling baseline...`);
      await reconcilePendingTransaction({
        client: readClient,
        contractAddress: CONTRACT_ADDRESS,
        escrowId: cand.id,
        record: cand,
        stepKey: "releaseAttempt",
        expectedEscrowStatus: "RELEASED",
        expectedMatchReason: "200_IN_WINDOW",
        expectedEconomicsDelta: "PAYOUT",
        amountWei: cand.fundedAmountWei,
        saveEvidence,
      });
      console.log(`  [✓] Successfully reconciled candidate release attempt.`);
    }

    if (cand.releaseAttempt?.verified) {
      console.log(`  [✓] Release attempt already verified for this candidate.`);
      cand.finalState = {
        status: "RELEASED",
        settled: true,
        matchReason: "200_IN_WINDOW",
        recipientPayoutWei: cand.fundedAmountWei,
      };
      saveEvidence();
      continue;
    }

    const escrow = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [cand.id],
    });

    if (!escrow) {
      throw new Error(`Candidate escrow not found on-chain: ${cand.id}`);
    }

    const startStr = escrow.window_start_utc;
    const endStr = escrow.window_end_utc;
    const expStr = escrow.expire_at_utc;
    const start = new Date(startStr);
    const end = new Date(endStr);
    const expire = new Date(expStr);

    console.log(`  Current State: status=${escrow.status}, amount=${escrow.amount}`);
    console.log(`  Window:        ${startStr} -> ${endStr}`);
    console.log(`  Expire At:     ${expStr}`);

    if (escrow.status === "RELEASED") {
      console.log(`  [✓] Escrow already RELEASED on-chain.`);
      cand.finalState = {
        status: "RELEASED",
        settled: true,
        matchReason: escrow.match_reason,
        publishTime: escrow.publish_time,
        recipientPayoutWei: escrow.payout.toString(),
      };
      saveEvidence();
      continue;
    }

    // 2. LIVE HTTP CHECK OF OFFICIAL REGISTRY ENDPOINT
    console.log(`  [*] Querying official registry endpoint for ${cand.package}@${cand.version}...`);
    const regCheck = await queryRegistryMetadata(cand.template, cand.package, cand.version);
    console.log(`      Registry Check: ${regCheck.summary} (HTTP ${regCheck.statusCode})`);

    cand.latestRegistryCheck = {
      timestampUtc: now.toISOString(),
      ...regCheck,
    };
    saveEvidence();

    // 3. TIME GATE: PRE-WINDOW CHECK
    if (now < start) {
      const hoursLeft = ((start.getTime() - now.getTime()) / (3600 * 1000)).toFixed(2);
      console.log(`  [🔒 TIME-GATED] Window opens in ${hoursLeft} hours (${startStr}).`);
      console.log(`      Release call prohibited by contract before window_start.`);
      cand.currentStatus = "OPEN_PENDING_WINDOW";
      cand.timeRemainingHours = hoursLeft;
      saveEvidence();
      continue;
    }

    // 4. TIME GATE: EXPIRED CHECK
    if (now >= expire) {
      console.log(`  [!] Expire instant passed (${expStr}). Escrow can no longer be released to recipient.`);
      cand.currentStatus = "EXPIRED";
      cand.finding = `Escrow expired at ${expStr}`;
      saveEvidence();
      continue;
    }

    // 5. REGISTRY EVIDENCE VALIDATION:
    // Submit only when the exact version has trustworthy evidence of publication inside the escrow window and is not yanked.
    // For missing, inconclusive, yanked, or out-of-window evidence, record the finding and stop without a write.

    // A. MISSING EVIDENCE
    if (!regCheck.exists || regCheck.statusCode === 404) {
      console.log(`  [⏳ WAITING PUBLICATION] Artifact is not yet published on ${cand.target} (HTTP 404). Stopping without write.`);
      cand.currentStatus = "AWAITING_PUBLICATION";
      cand.finding = "Missing: package or version not found on registry (HTTP 404)";
      saveEvidence();
      continue;
    }

    // B. INCONCLUSIVE EVIDENCE
    if (regCheck.kind !== "200") {
      console.log(`  [⚠️ INCONCLUSIVE] Registry response lacks reliable publication evidence (${regCheck.kind}): ${regCheck.error || regCheck.summary}. Stopping without write.`);
      cand.currentStatus = "REGISTRY_INCONCLUSIVE";
      cand.finding = `Inconclusive registry response (${regCheck.kind}): ${regCheck.error || regCheck.summary}`;
      saveEvidence();
      continue;
    }

    // C. YANKED EVIDENCE
    if (regCheck.isYanked) {
      console.log(`  [⚠️ YANKED] Exact version is marked yanked on ${cand.target}. Stopping without write.`);
      cand.currentStatus = "YANKED";
      cand.finding = `Version is yanked on registry (${regCheck.yankedReason || "yanked"})`;
      saveEvidence();
      continue;
    }

    // D. PUBLICATION TIMESTAMP PARSING & WINDOW VALIDATION
    let pubDt = null;
    try {
      pubDt = regCheck.publishTime ? parseUtcIso(regCheck.publishTime) : null;
    } catch {
      pubDt = null;
    }

    if (!pubDt) {
      console.log(`  [⚠️ INCONCLUSIVE] Could not parse publication timestamp (${regCheck.publishTime}). Stopping without write.`);
      cand.currentStatus = "REGISTRY_INCONCLUSIVE";
      cand.finding = `Unparseable publication timestamp: ${regCheck.publishTime}`;
      saveEvidence();
      continue;
    }

    if (pubDt < start || pubDt > end) {
      console.log(`  [⚠️ OUT-OF-WINDOW] Publication timestamp (${regCheck.publishTime}) is outside window [${startStr}, ${endStr}]. Stopping without write.`);
      cand.currentStatus = "OUT_OF_WINDOW";
      cand.finding = `Publication timestamp (${regCheck.publishTime}) is outside escrow window [${startStr}, ${endStr}]`;
      saveEvidence();
      continue;
    }

    // 6. TRUSTWORTHY PUBLICATION INSIDE WINDOW CONFIRMED:
    // Execute write transaction with pre-transaction baseline snapshot persistence and fail-closed checks.
    console.log(`  [🎯 TRUSTWORTHY EVIDENCE] Valid non-yanked publication inside window at ${regCheck.publishTime}.`);
    const caller = await getCallerAccount();
    const writeClient = createClient({ chain: studioDevnet, account: caller });

    await executeWithBaselineSnapshot({
      client: readClient,
      contractAddress: CONTRACT_ADDRESS,
      escrowId: cand.id,
      record: cand,
      stepKey: "releaseAttempt",
      submitFn: async () => {
        const feeEst = await writeClient.estimateTransactionFeesForWrite({
          address: CONTRACT_ADDRESS,
          functionName: "release",
          args: [cand.id],
          leaderTimeunitsAllocation: 200n,
          validatorTimeunitsAllocation: 400n,
          rotations: [0n],
        });
        if (!feeEst.messageAllocations || feeEst.messageAllocations.length === 0) {
          throw new Error(`Failed to estimate message allocations for candidate release payout of ${cand.id}`);
        }
        return await writeClient.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: "release",
          args: [cand.id],
          fees: {
            distribution: feeEst.distribution,
            messageAllocations: feeEst.messageAllocations,
            feeValue: feeEst.feeValue,
          },
        });
      },
      expectedEscrowStatus: "RELEASED",
      expectedMatchReason: "200_IN_WINDOW",
      expectedEconomicsDelta: "PAYOUT",
      amountWei: cand.fundedAmountWei,
      saveEvidence,
    });

    cand.explorerTxUrl = `https://explorer-studio-dev.genlayer.com/tx/${cand.releaseAttempt.txHash}`;
    cand.finalState = {
      status: "RELEASED",
      settled: true,
      matchReason: "200_IN_WINDOW",
      recipientPayoutWei: cand.fundedAmountWei,
    };
    saveEvidence();
    console.log(`  [✓] Candidate escrow successfully released and verified!`);
  }

  saveEvidence();
  console.log(`\n[✓] Candidate evidence atomically updated at: ${EVIDENCE_FILE}`);
}

main().catch((err) => {
  console.error("[-] Candidate runner error:", err);
  process.exit(1);
});
