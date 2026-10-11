/**
 * settle_404_escrows.mjs
 *
 * Fail-closed, crash-resilient runner for ShipLock's PyPI & npm 404 test escrows on GenLayer Studio Next.
 *
 * Schedule:
 * - Funding UTC:      2026-10-11 08:33:18 UTC
 * - Window Start UTC: 2026-10-12 10:33:18 UTC  (now <= window_start - 24h timelock)
 * - Window End UTC:   2026-10-14 10:33:18 UTC
 *
 * Guarantees:
 * 1. Strict time gate: Never submits before window_start.
 * 2. Fail-closed execution: Requires FINALIZED status and FINISHED_WITH_RETURN result.
 * 3. Atomic persistence: Writes evidence via atomic temporary file rename.
 * 4. Pending tx recovery: Persists tx hash immediately before waiting; reconciles on rerun.
 * 5. Full state & economics verification: Verifies before/after escrow data, principal, match_reason,
 *    and economics deltas. Never marks verified on status alone.
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

const ESCROWS_TO_SETTLE = [
  {
    name: "PyPI 404 Escrow",
    template: "PYPI_VERSION",
    package: "shiplock-smoke-does-not-exist",
    version: "0.0.0-smoke.1",
    id: "0x1ac2eea7c83967a0abe667355598d3809fb2552cc5d4227ad7ba86fee09a3c46",
    fundTx: "0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312",
  },
  {
    name: "npm 404 Escrow",
    template: "NPM_VERSION",
    package: "shiplock-smoke-does-not-exist-npm",
    version: "0.0.0-smoke.1",
    id: "0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e",
    fundTx: "0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617",
  },
];

async function getCallerAccount() {
  const callerPk = await keytar.getPassword("genlayer-cli", "account:coverlock-submitter");
  if (callerPk) {
    const cleanPk = callerPk.startsWith("0x") ? callerPk : `0x${callerPk}`;
    return createAccount(cleanPk);
  }
  throw new Error("No non-funder caller account available in keytar to submit release transaction.");
}

async function main() {
  console.log("=== ShipLock 404 Escrow Settlement & Evidence Monitor ===");
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`Chain ID: 61997 (Studio Next)`);

  const readClient = createClient({ chain: studioDevnet });
  const now = new Date();
  console.log(`Current UTC Time: ${now.toISOString()}`);

  let evidence = readJsonSafe(EVIDENCE_FILE) || {
    contractAddress: CONTRACT_ADDRESS,
    checkedAtUtc: now.toISOString(),
    escrows: [],
  };
  evidence.checkedAtUtc = now.toISOString();

  const saveEvidence = () => {
    atomicWriteJson(EVIDENCE_FILE, evidence);
  };

  const econCurrent = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_economics",
    args: [],
  });
  evidence.economics = {
    escrowedOpenWei: econCurrent.escrowed_open.toString(),
    outstandingCreditsWei: econCurrent.outstanding_credits.toString(),
    paidToRecipientsWei: econCurrent.paid_to_recipients.toString(),
    refundedToFundersWei: econCurrent.refunded_to_funders.toString(),
    treasuryWei: econCurrent.treasury.toString(),
  };
  console.log("\nCurrent On-Chain Economics:", JSON.stringify(econCurrent, (k, v) => (typeof v === "bigint" ? v.toString() : v)));

  for (const item of ESCROWS_TO_SETTLE) {
    console.log(`\n--- Inspecting ${item.name} (${item.id.slice(0, 10)}...) ---`);
    const escrow = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [item.id],
    });

    if (!escrow) {
      throw new Error(`Escrow not found on chain: ${item.id}`);
    }

    const startStr = escrow.window_start_utc || escrow.window_start;
    const endStr = escrow.window_end_utc || escrow.window_end;
    const expStr = escrow.expire_at_utc || escrow.expire_at;
    const windowStart = new Date(startStr);
    const windowEnd = new Date(endStr);

    console.log(`  Package:      ${escrow.package_name}@${escrow.version} (${escrow.template})`);
    console.log(`  Current State: status=${escrow.status}, matchReason=${escrow.match_reason}, amount=${escrow.amount}`);
    console.log(`  Window:       ${startStr} -> ${endStr}`);

    let existingIndex = evidence.escrows.findIndex((e) => e.id === item.id);
    let record = existingIndex >= 0 ? evidence.escrows[existingIndex] : {
      id: item.id,
      name: item.name,
      template: item.template,
      package: item.package,
      version: item.version,
      fundTx: item.fundTx,
      windowStartUtc: startStr,
      windowEndUtc: endStr,
      expireAtUtc: expStr,
      funder: escrow.funder,
      recipient: escrow.recipient,
      principalWei: escrow.amount.toString(),
      initialStatus: escrow.status,
      initialMatchReason: escrow.match_reason,
    };
    if (existingIndex < 0) {
      evidence.escrows.push(record);
    }

    // Check registry endpoint live
    console.log(`  [*] Querying official ${item.template} endpoint...`);
    const regCheck = await queryRegistryMetadata(item.template, item.package, item.version);
    console.log(`      Registry Check: ${regCheck.summary} (HTTP ${regCheck.statusCode})`);
    record.latestRegistryCheck = {
      timestampUtc: now.toISOString(),
      ...regCheck,
    };

    if (escrow.status === "REFUND_NOHIT") {
      console.log(`  [✓] Escrow already fully settled as REFUND_NOHIT. No submission needed.`);
      record.finalState = {
        status: "REFUND_NOHIT",
        settled: true,
        matchReason: escrow.match_reason,
        funderRefundWei: escrow.refund.toString(),
      };
      saveEvidence();
      continue;
    }

    if (now < windowStart) {
      const msLeft = windowStart.getTime() - now.getTime();
      const hoursLeft = (msLeft / (1000 * 60 * 60)).toFixed(2);
      console.log(`  [🔒 TIME-GATED] Window opens in ${hoursLeft} hours (${windowStart.toISOString()}).`);
      console.log(`      Pre-window release strictly prohibited by contract.`);
      record.currentStatus = "OPEN_PENDING_WINDOW";
      record.timeRemainingHours = hoursLeft;
      saveEvidence();
      continue;
    }

    if (now >= windowStart && now < windowEnd) {
      console.log(`  [⏳ IN-WINDOW] Execution window is ACTIVE.`);
      if (record.inWindowAttempt?.verified) {
        console.log(`  [✓] In-window release check already verified (Tx: ${record.inWindowAttempt.txHash}). Escrow remains OPEN.`);
        continue;
      }

      console.log(`  [*] Executing in-window release attempt with fail-closed checks...`);
      const caller = await getCallerAccount();
      const writeClient = createClient({ chain: studioDevnet, account: caller });

      const econBefore = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_economics",
        args: [],
      });

      const { txHash, txInfo } = await executeWithPendingRecovery({
        client: readClient,
        record,
        stepKey: "inWindowAttempt",
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
            args: [item.id],
            fees: {
              distribution: feeEst.distribution,
              feeValue: feeEst.feeValue,
            },
          });
        },
      });

      // Verify on-chain post state
      const afterState = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_escrow",
        args: [item.id],
      });
      console.log(`  [✓] Post-Tx Escrow State: status=${afterState.status}, matchReason=${afterState.match_reason}`);

      if (afterState.status !== "OPEN") {
        throw new Error(`In-window release check failed: expected escrow to remain OPEN, got ${afterState.status}`);
      }
      if (BigInt(afterState.amount) !== BigInt(record.principalWei)) {
        throw new Error(`In-window check failed: principal modified! Expected ${record.principalWei}, got ${afterState.amount}`);
      }
      if (BigInt(afterState.payout) !== 0n || BigInt(afterState.refund) !== 0n) {
        throw new Error(`In-window check failed: payout or refund non-zero while OPEN!`);
      }

      // Verify economics unchanged
      const econAfter = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_economics",
        args: [],
      });
      verifyEconomicsDelta({
        econBefore,
        econAfter,
        expectedType: "NO_CHANGE",
        amountWei: record.principalWei,
      });

      record.inWindowAttempt = {
        ...record.inWindowAttempt,
        timestampUtc: new Date().toISOString(),
        txHash,
        explorerUrl: `https://explorer-studio-dev.genlayer.com/tx/${txHash}`,
        txStatus: txInfo.statusName,
        executionResult: txInfo.txExecutionResultName,
        resultingEscrowStatus: afterState.status,
        resultingMatchReason: afterState.match_reason,
        verified: true,
      };
      saveEvidence();
      continue;
    }

    if (now >= windowEnd) {
      console.log(`  [🏁 POST-WINDOW] Deadline reached. Executing final REFUND_NOHIT settlement...`);
      if (record.postWindowSettlement?.verified) {
        console.log(`  [✓] Post-window settlement already verified (Tx: ${record.postWindowSettlement.txHash}).`);
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
        record,
        stepKey: "postWindowSettlement",
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
            args: [item.id],
            fees: {
              distribution: feeEst.distribution,
              feeValue: feeEst.feeValue,
            },
          });
        },
      });

      // Verify on-chain post state
      const afterState = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_escrow",
        args: [item.id],
      });
      console.log(`  [✓] Post-Tx Escrow State: status=${afterState.status}, matchReason=${afterState.match_reason}`);

      if (afterState.status !== "REFUND_NOHIT") {
        throw new Error(`Post-window settlement failed: expected REFUND_NOHIT, got ${afterState.status}`);
      }
      if (afterState.match_reason !== "WINDOW_EXPIRED_NO_RELEASE") {
        throw new Error(`Expected WINDOW_EXPIRED_NO_RELEASE match_reason, got ${afterState.match_reason}`);
      }
      if (BigInt(afterState.refund) !== BigInt(record.principalWei)) {
        throw new Error(`Expected full refund ${record.principalWei}, got ${afterState.refund}`);
      }
      if (BigInt(afterState.payout) !== 0n) {
        throw new Error(`Expected payout 0, got ${afterState.payout}`);
      }

      // Verify economics delta
      const econAfter = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_economics",
        args: [],
      });
      verifyEconomicsDelta({
        econBefore,
        econAfter,
        expectedType: "REFUND",
        amountWei: record.principalWei,
      });

      record.postWindowSettlement = {
        ...record.postWindowSettlement,
        timestampUtc: new Date().toISOString(),
        txHash,
        explorerUrl: `https://explorer-studio-dev.genlayer.com/tx/${txHash}`,
        txStatus: txInfo.statusName,
        executionResult: txInfo.txExecutionResultName,
        resultingEscrowStatus: afterState.status,
        resultingMatchReason: afterState.match_reason,
        funderRefundWei: afterState.refund.toString(),
        verified: true,
      };
      saveEvidence();
    }
  }

  saveEvidence();
  console.log(`\n[✓] Evidence record atomically updated at: ${EVIDENCE_FILE}`);
}

main().catch((err) => {
  console.error("[-] Settle error:", err);
  process.exit(1);
});
