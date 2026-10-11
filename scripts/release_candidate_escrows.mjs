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
 * Key contract behavior:
 * - A version published INSIDE [window_start, window_end] can be released to recipient
 *   ANY TIME while window_start <= now < expire_at (even after window_end has passed)!
 *
 * Guarantees:
 * 1. Checks exact PyPI / npm version endpoints live via HTTP and records response & publish timestamp.
 * 2. Never submits release before window_start.
 * 3. Persists transaction hash immediately before waiting.
 * 4. Reconciles existing pending transactions upon rerun.
 * 5. Requires FINALIZED status and FINISHED_WITH_RETURN execution result.
 * 6. Verifies post-state on-chain: status RELEASED, match_reason 200_IN_WINDOW, exact payout to recipient.
 * 7. Verifies before/after on-chain economics deltas.
 * 8. Writes evidence atomically via temp file rename.
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  atomicWriteJson,
  readJsonSafe,
  executeWithPendingRecovery,
  verifyEconomicsDelta,
  queryRegistryMetadata,
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

    // Live HTTP check of the official registry endpoint
    console.log(`  [*] Querying official registry endpoint for ${cand.package}@${cand.version}...`);
    const regCheck = await queryRegistryMetadata(cand.template, cand.package, cand.version);
    console.log(`      Registry Check: ${regCheck.summary} (HTTP ${regCheck.statusCode})`);

    cand.latestRegistryCheck = {
      timestampUtc: now.toISOString(),
      ...regCheck,
    };
    saveEvidence();

    if (now < start) {
      const hoursLeft = ((start.getTime() - now.getTime()) / (3600 * 1000)).toFixed(2);
      console.log(`  [🔒 TIME-GATED] Window opens in ${hoursLeft} hours (${startStr}).`);
      console.log(`      Release call prohibited by contract before window_start.`);
      cand.currentStatus = "OPEN_PENDING_WINDOW";
      cand.timeRemainingHours = hoursLeft;
      saveEvidence();
      continue;
    }

    if (now >= expire) {
      console.log(`  [!] Expire instant passed (${expStr}). Escrow can no longer be released to recipient.`);
      cand.currentStatus = "EXPIRED";
      saveEvidence();
      continue;
    }

    // Inside valid release window: start <= now < expire
    if (!regCheck.exists) {
      console.log(`  [⏳ WAITING PUBLICATION] Artifact is not yet published on ${cand.target}.`);
      if (now < end) {
        const hoursUntilEnd = ((end.getTime() - now.getTime()) / (3600 * 1000)).toFixed(2);
        console.log(`      Publication window remains open for ${hoursUntilEnd} more hours.`);
        console.log(`      Must publish before ${endStr} to achieve RELEASED state.`);
      } else {
        console.log(`      Publication window closed at ${endStr}. Submitting release now will result in REFUND_NOHIT.`);
      }
      continue;
    }

    // Artifact exists on registry! Validate publication timestamp
    const pubDt = regCheck.publishTime ? new Date(regCheck.publishTime) : null;
    console.log(`  [✓] Artifact published at ${regCheck.publishTime}.`);

    const isInsideWindow = pubDt && pubDt >= start && pubDt <= end;
    if (isInsideWindow) {
      console.log(`  [🎯 QUALIFIED RELEASE] publish_time is inside [start, end]! Proceeding with release write...`);
    } else {
      console.log(`  [⚠️ OUT-OF-WINDOW] publish_time (${regCheck.publishTime}) is outside window. Proceeding will trigger REFUND_NOHIT.`);
    }

    if (cand.releaseAttempt?.verified) {
      console.log(`  [✓] Release attempt already verified for this candidate.`);
      continue;
    }

    const caller = await getCallerAccount();
    const writeClient = createClient({ chain: studioDevnet, account: caller });

    const econBefore = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_economics",
      args: [],
    });

    const { txHash, txInfo } = await executeWithPendingRecovery({
      client: readClient,
      record: cand,
      stepKey: "releaseAttempt",
      saveEvidence,
      submitFn: async () => {
        const feeEst = await writeClient.estimateTransactionFees({
          leaderTimeunitsAllocation: 150n,
          validatorTimeunitsAllocation: 300n,
          rotations: [0n],
        });
        return await writeClient.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: "release",
          args: [cand.id],
          fees: {
            distribution: feeEst.distribution,
            feeValue: feeEst.feeValue,
          },
        });
      },
    });

    // Verify post state on-chain
    const after = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [cand.id],
    });
    console.log(`  [✓] Post-Tx On-Chain State: status=${after.status}, matchReason=${after.match_reason}, payout=${after.payout}`);

    const econAfter = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_economics",
      args: [],
    });

    if (isInsideWindow) {
      if (after.status !== "RELEASED") {
        throw new Error(`Expected RELEASED status, got ${after.status}`);
      }
      if (after.match_reason !== "200_IN_WINDOW") {
        throw new Error(`Expected 200_IN_WINDOW match_reason, got ${after.match_reason}`);
      }
      if (BigInt(after.payout) !== BigInt(cand.fundedAmountWei)) {
        throw new Error(`Expected payout ${cand.fundedAmountWei}, got ${after.payout}`);
      }

      verifyEconomicsDelta({
        econBefore,
        econAfter,
        expectedType: "PAYOUT",
        amountWei: cand.fundedAmountWei,
      });
    }

    cand.releaseAttempt = {
      ...cand.releaseAttempt,
      timestampUtc: new Date().toISOString(),
      txHash,
      explorerTxUrl: `https://explorer-studio-dev.genlayer.com/tx/${txHash}`,
      txStatus: txInfo.statusName,
      executionResult: txInfo.txExecutionResultName,
      resultingStatus: after.status,
      matchReason: after.match_reason,
      payoutWei: after.payout.toString(),
      recipient: after.recipient,
      verified: true,
    };
    saveEvidence();
  }

  saveEvidence();
  console.log(`\n[✓] Evidence record atomically updated.`);
}

main().catch((err) => {
  console.error("[-] Error:", err);
  process.exit(1);
});
