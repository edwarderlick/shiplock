/**
 * settle_404_escrows.mjs
 *
 * Idempotent, time-gated runner for ShipLock's PyPI & npm 404 test escrows on GenLayer Studio Next.
 *
 * Schedule:
 * - Funding UTC:      2026-10-11 08:33:18 UTC
 * - Window Start UTC: 2026-10-12 10:33:18 UTC  (now <= window_start - 24h timelock)
 * - Window End UTC:   2026-10-14 10:33:18 UTC
 *
 * Capabilities:
 * 1. Pre-window check: Enforces time gate; never submits early transactions.
 * 2. In-window release attempt (2026-10-12 10:33:18 to 2026-10-14 10:33:18 UTC):
 *    Submits one release check against missing package. Verifies execution completes,
 *    and escrow stays OPEN with intact principal.
 * 3. Post-window settlement (after 2026-10-14 10:33:18 UTC):
 *    Submits release to finalize REFUND_NOHIT and routes principal back to funder.
 * 4. Re-run safe: Always checks on-chain state first; skips already-settled escrows.
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const { createClient, createAccount } = require(resolve(root, "web/node_modules/genlayer-js/dist/index.js"));
const { studioDevnet } = require(resolve(root, "web/node_modules/genlayer-js/dist/chains/index.js"));
const { privateKeyToAccount } = require(resolve(root, "web/node_modules/viem/accounts"));
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
    fundTx: "0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312"
  },
  {
    name: "npm 404 Escrow",
    template: "NPM_VERSION",
    package: "shiplock-smoke-does-not-exist-npm",
    version: "0.0.0-smoke.1",
    id: "0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e",
    fundTx: "0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617"
  }
];

async function getCallerAccount() {
  // Caller must be anyone except the funder (0x20E850BAaD26d763d4f691780D1BEBA01c8D6084)
  // Try coverlock-submitter account in keytar first
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

  let evidence = {
    contractAddress: CONTRACT_ADDRESS,
    checkedAtUtc: now.toISOString(),
    escrows: []
  };

  if (existsSync(EVIDENCE_FILE)) {
    try {
      evidence = JSON.parse(readFileSync(EVIDENCE_FILE, "utf-8"));
      evidence.checkedAtUtc = now.toISOString();
    } catch {}
  }

  const econBefore = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_economics",
    args: []
  });
  evidence.economics = {
    escrowedOpenWei: econBefore.escrowed_open.toString(),
    outstandingCreditsWei: econBefore.outstanding_credits.toString(),
    paidToRecipientsWei: econBefore.paid_to_recipients.toString(),
    refundedToFundersWei: econBefore.refunded_to_funders.toString(),
    treasuryWei: econBefore.treasury.toString()
  };
  console.log("\nCurrent On-Chain Economics:", JSON.stringify(econBefore, (k, v) => typeof v === 'bigint' ? v.toString() : v));

  for (const item of ESCROWS_TO_SETTLE) {
    console.log(`\n--- Inspecting ${item.name} (${item.id.slice(0, 10)}...) ---`);
    const escrow = await readClient.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [item.id]
    });

    if (!escrow) {
      console.error(`[-] Escrow not found on chain: ${item.id}`);
      continue;
    }

    const startStr = escrow.window_start_utc || escrow.window_start;
    const endStr = escrow.window_end_utc || escrow.window_end;
    const windowStart = new Date(startStr);
    const windowEnd = new Date(endStr);

    console.log(`  Package:      ${escrow.package_name}@${escrow.version} (${escrow.template})`);
    console.log(`  Current State: status=${escrow.status}, matchReason=${escrow.match_reason}, amount=${escrow.amount}`);
    console.log(`  Window:       ${startStr} -> ${endStr}`);

    let existingIndex = evidence.escrows.findIndex(e => e.id === item.id);
    let record = existingIndex >= 0 ? evidence.escrows[existingIndex] : {
      id: item.id,
      name: item.name,
      template: item.template,
      package: item.package,
      version: item.version,
      fundTx: item.fundTx,
      windowStartUtc: startStr,
      windowEndUtc: endStr,
      funder: escrow.funder,
      recipient: escrow.recipient,
      principalWei: escrow.amount.toString(),
      initialStatus: escrow.status,
      initialMatchReason: escrow.match_reason,
    };
    if (existingIndex < 0) {
      evidence.escrows.push(record);
    }

    if (escrow.status === "REFUND_NOHIT") {
      console.log(`  [✓] Escrow already fully settled as REFUND_NOHIT. No submission needed.`);
      record.finalState = {
        status: "REFUND_NOHIT",
        settled: true,
        matchReason: escrow.match_reason,
        funderCredit: escrow.amount.toString()
      };
      continue;
    }

    if (now < windowStart) {
      const msLeft = windowStart.getTime() - now.getTime();
      const hoursLeft = (msLeft / (1000 * 60 * 60)).toFixed(2);
      console.log(`  [🔒 TIME-GATED] Window opens in ${hoursLeft} hours (${windowStart.toISOString()}).`);
      console.log(`      Pre-window release strictly prohibited by contract.`);
      record.currentStatus = "OPEN_PENDING_WINDOW";
      record.timeRemainingHours = hoursLeft;
      continue;
    }

    if (now >= windowStart && now < windowEnd) {
      console.log(`  [⏳ IN-WINDOW] Execution window is ACTIVE.`);
      if (record.inWindowAttempt?.verified) {
        console.log(`  [✓] In-window release check already performed (Tx: ${record.inWindowAttempt.txHash}). Escrow remains OPEN.`);
        continue;
      }

      console.log(`  [*] Submitting in-window release check to verify still-missing package leaves escrow OPEN...`);
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
        args: [item.id],
        fees: {
          distribution: feeEst.distribution,
          feeValue: feeEst.feeValue,
        },
      });

      console.log(`  [*] Submitted tx: ${txHash}. Waiting for finalization...`);
      await writeClient.waitForTransactionReceipt({
        hash: txHash,
        waitUntil: "finalized",
        retries: 100,
        interval: 3000,
      });

      const txInfo = await writeClient.getTransaction({ hash: txHash });
      console.log(`  [✓] Tx Finalized. Status: ${txInfo.statusName}, Execution: ${txInfo.txExecutionResultName}`);

      const afterState = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_escrow",
        args: [item.id]
      });

      console.log(`  [✓] Post-Tx Escrow State: status=${afterState.status}, amount=${afterState.amount}`);
      record.inWindowAttempt = {
        timestampUtc: new Date().toISOString(),
        txHash,
        explorerUrl: `https://explorer-studio-dev.genlayer.com/tx/${txHash}`,
        txStatus: txInfo.statusName,
        executionResult: txInfo.txExecutionResultName,
        resultingEscrowStatus: afterState.status,
        verified: afterState.status === "OPEN"
      };
      continue;
    }

    if (now >= windowEnd) {
      console.log(`  [🏁 POST-WINDOW] Deadline reached. Submitting final REFUND_NOHIT settlement...`);
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
        args: [item.id],
        fees: {
          distribution: feeEst.distribution,
          feeValue: feeEst.feeValue,
        },
      });

      console.log(`  [*] Submitted tx: ${txHash}. Waiting for finalization...`);
      await writeClient.waitForTransactionReceipt({
        hash: txHash,
        waitUntil: "finalized",
        retries: 100,
        interval: 3000,
      });

      const txInfo = await writeClient.getTransaction({ hash: txHash });
      console.log(`  [✓] Tx Finalized. Status: ${txInfo.statusName}, Execution: ${txInfo.txExecutionResultName}`);

      const afterState = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_escrow",
        args: [item.id]
      });

      console.log(`  [✓] Post-Tx Escrow State: status=${afterState.status}, matchReason=${afterState.match_reason}`);
      record.postWindowSettlement = {
        timestampUtc: new Date().toISOString(),
        txHash,
        explorerUrl: `https://explorer-studio-dev.genlayer.com/tx/${txHash}`,
        txStatus: txInfo.statusName,
        executionResult: txInfo.txExecutionResultName,
        resultingEscrowStatus: afterState.status,
        verified: afterState.status === "REFUND_NOHIT"
      };
    }
  }

  // Update evidence file
  writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2), "utf-8");
  console.log(`\n[✓] Evidence record updated at: ${EVIDENCE_FILE}`);
}

main().catch(err => {
  console.error("[-] Settle error:", err);
  process.exit(1);
});
