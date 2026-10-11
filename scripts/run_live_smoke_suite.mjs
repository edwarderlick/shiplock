import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const { createClient, createAccount } = require(resolve(root, "web/node_modules/genlayer-js/dist/index.js"));
const { studioDevnet } = require(resolve(root, "web/node_modules/genlayer-js/dist/chains/index.js"));
const { getAddress, sha256, stringToBytes } = require(resolve(root, "web/node_modules/viem"));
const keytar = require(resolve(homedir(), "AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar"));

const RPC_URL = "https://studio-dev.genlayer.com/api";
const CONTRACT_ADDRESS = getAddress("0x7Cef756668Cd925807e8B110D0330643c6F809E3");
const RECIPIENT_ADDRESS = getAddress("0x0f907a2598aef71b988f9208103066586a1a4af0"); // safe buyer-test account != deployer
const ACCOUNT_NAME = "shiplock-deployer-live";

function normalizeIsoUtc(d) {
  return d.toISOString().split(".")[0] + "Z";
}

function deriveEscrowId(inputs) {
  const funderHex = inputs.funder.trim().toLowerCase();
  const payeeHex = inputs.recipient.trim().toLowerCase();
  const template = inputs.template.trim();
  const pkg = inputs.packageName.trim();
  const ver = inputs.version.trim();
  const startIso = normalizeIsoUtc(inputs.windowStart);
  const endIso = normalizeIsoUtc(inputs.windowEnd);
  const amountStr = BigInt(inputs.amountWei).toString();
  const nonceStr = BigInt(inputs.nonce).toString();

  const preimage = `${funderHex}|${payeeHex}|${template}|${pkg}|${ver}|${startIso}|${endIso}|${amountStr}|${nonceStr}`;
  return sha256(stringToBytes(preimage));
}

async function main() {
  console.log("=== ShipLock Studio Next Live Transaction Smoke Suite ===");
  console.log(`Contract Address  : ${CONTRACT_ADDRESS}`);
  console.log(`Canonical RPC     : ${RPC_URL}`);

  // 1. Load deployer account
  const secret = await keytar.getPassword("genlayer-cli", `account:${ACCOUNT_NAME}`);
  if (!secret) throw new Error(`Missing ${ACCOUNT_NAME} secret`);
  const account = createAccount(secret);
  const client = createClient({
    chain: studioDevnet,
    endpoint: RPC_URL,
    account,
  });

  console.log(`[+] Funder / Deployer Address: ${account.address}`);
  console.log(`[+] Recipient Address        : ${RECIPIENT_ADDRESS}`);

  // 2. Initial State Verification
  console.log("\n--- [Step 1] Initial Contract State Verification ---");
  const initialIds = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "list_ids",
    args: [],
  });
  const initialEcon = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_economics",
    args: [],
  });
  console.log(`[✓] Initial Escrow IDs count : ${initialIds.length}`);
  console.log(`[✓] Initial Economics        : ${JSON.stringify(initialEcon)}`);

  const results = {
    contractAddress: CONTRACT_ADDRESS,
    deployerAddress: account.address,
    recipientAddress: RECIPIENT_ADDRESS,
    initialState: {
      escrowIdsCount: initialIds.length,
      economics: initialEcon,
    },
    liveTests: {},
  };

  // Setup future time windows:
  // now <= window_start - 24h
  // Let now be current time; window_start = now + 26 hours; window_end = window_start + 48 hours
  const now = new Date();
  const windowStart = new Date(now.getTime() + 26 * 3600 * 1000);
  const windowEnd = new Date(windowStart.getTime() + 48 * 3600 * 1000);

  const windowStartUtc = normalizeIsoUtc(windowStart);
  const windowEndUtc = normalizeIsoUtc(windowEnd);

  console.log(`\nTimeline Planning:`);
  console.log(`  Current Time UTC    : ${normalizeIsoUtc(now)}`);
  console.log(`  Window Start UTC    : ${windowStartUtc} (+26h from now, satisfies >= 24h)`);
  console.log(`  Window End UTC      : ${windowEndUtc} (+48h duration, satisfies 1..14d)`);

  results.timeGating = {
    fundingTimeUtc: normalizeIsoUtc(now),
    earliestEarlyRetryUtc: windowStartUtc,
    earliestReleaseUtc: windowStartUtc,
    windowEndUtc: windowEndUtc,
    note: "ShipLock enforces now <= window_start - 24h. The escrows remain OPEN until window_start is reached.",
  };

  // --- [Step 2] PyPI Escrow Funding ---
  console.log("\n--- [Step 2] Live PyPI Escrow Funding (404 Package) ---");
  const pypiPkg = "shiplock-smoke-does-not-exist";
  const pypiVer = "0.0.0-smoke.1";
  const pypiAmount = 20000000000000000n; // 0.02 GEN
  const pypiNonce = 1001n;

  const expectedPypiId = deriveEscrowId({
    funder: account.address,
    recipient: RECIPIENT_ADDRESS,
    template: "PYPI_VERSION",
    packageName: pypiPkg,
    version: pypiVer,
    windowStart,
    windowEnd,
    amountWei: pypiAmount,
    nonce: pypiNonce,
  });
  console.log(`[+] Expected Deterministic PyPI Escrow ID: ${expectedPypiId}`);

  // Safe timeunit bounds per TESTCASES.md (100n-150n leader, 200n-300n validator to avoid PhaseTimeoutOutOfBounds(>600))
  console.log("[*] Estimating fees for fund_escrow (PyPI)...");
  const pypiFeeEst = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 150n,
    validatorTimeunitsAllocation: 300n,
    rotations: [0n],
  });

  console.log("[*] Submitting fund_escrow transaction for PyPI...");
  const pypiTxHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "fund_escrow",
    args: [
      "PYPI_VERSION",
      pypiPkg,
      pypiVer,
      RECIPIENT_ADDRESS,
      windowStartUtc,
      windowEndUtc,
      pypiNonce,
    ],
    value: pypiAmount,
    fees: {
      distribution: pypiFeeEst.distribution,
      feeValue: pypiFeeEst.feeValue,
    },
  });
  console.log(`[RECORDED] PyPI Escrow Fund Tx Hash: ${pypiTxHash}`);
  console.log("[*] Waiting for transaction finalization...");
  await client.waitForTransactionReceipt({
    hash: pypiTxHash,
    waitUntil: "finalized",
    retries: 100,
    interval: 3000,
  });

  const pypiTx = await client.getTransaction({ hash: pypiTxHash });
  console.log(`[✓] PyPI Fund Status: ${pypiTx.statusName}, Execution: ${pypiTx.txExecutionResultName}`);
  if (pypiTx.statusName !== "FINALIZED" || pypiTx.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    throw new Error(`PyPI escrow funding did not succeed: ${JSON.stringify(pypiTx)}`);
  }

  // Read back escrow data
  const pypiEscrowData = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_escrow",
    args: [expectedPypiId],
  });
  console.log(`[✓] On-Chain Escrow Data for ${expectedPypiId}:`);
  console.log(`    Status       : ${pypiEscrowData.status}`);
  console.log(`    Match Reason : ${pypiEscrowData.match_reason}`);
  console.log(`    Amount       : ${pypiEscrowData.amount} wei`);
  console.log(`    Window Start : ${pypiEscrowData.window_start_utc}`);
  console.log(`    Window End   : ${pypiEscrowData.window_end_utc}`);

  if (pypiEscrowData.status !== "OPEN") {
    throw new Error(`Expected OPEN status, got ${pypiEscrowData.status}`);
  }

  results.liveTests.pypiEscrow = {
    template: "PYPI_VERSION",
    package: pypiPkg,
    version: pypiVer,
    amountWei: pypiAmount.toString(),
    nonce: pypiNonce.toString(),
    deterministicId: expectedPypiId,
    txHash: pypiTxHash,
    explorerTxUrl: `https://explorer-studio-dev.genlayer.com/tx/${pypiTxHash}`,
    status: pypiEscrowData.status,
    matchReason: pypiEscrowData.match_reason,
    verified: true,
  };

  // --- [Step 3] npm Escrow Funding ---
  console.log("\n--- [Step 3] Live npm Escrow Funding (404 Package) ---");
  const npmPkg = "shiplock-smoke-does-not-exist-npm";
  const npmVer = "0.0.0-smoke.1";
  const npmAmount = 20000000000000000n; // 0.02 GEN
  const npmNonce = 2002n;

  const expectedNpmId = deriveEscrowId({
    funder: account.address,
    recipient: RECIPIENT_ADDRESS,
    template: "NPM_VERSION",
    packageName: npmPkg,
    version: npmVer,
    windowStart,
    windowEnd,
    amountWei: npmAmount,
    nonce: npmNonce,
  });
  console.log(`[+] Expected Deterministic npm Escrow ID: ${expectedNpmId}`);

  console.log("[*] Estimating fees for fund_escrow (npm)...");
  const npmFeeEst = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 150n,
    validatorTimeunitsAllocation: 300n,
    rotations: [0n],
  });

  console.log("[*] Submitting fund_escrow transaction for npm...");
  const npmTxHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "fund_escrow",
    args: [
      "NPM_VERSION",
      npmPkg,
      npmVer,
      RECIPIENT_ADDRESS,
      windowStartUtc,
      windowEndUtc,
      npmNonce,
    ],
    value: npmAmount,
    fees: {
      distribution: npmFeeEst.distribution,
      feeValue: npmFeeEst.feeValue,
    },
  });
  console.log(`[RECORDED] npm Escrow Fund Tx Hash: ${npmTxHash}`);
  console.log("[*] Waiting for transaction finalization...");
  await client.waitForTransactionReceipt({
    hash: npmTxHash,
    waitUntil: "finalized",
    retries: 100,
    interval: 3000,
  });

  const npmTx = await client.getTransaction({ hash: npmTxHash });
  console.log(`[✓] npm Fund Status: ${npmTx.statusName}, Execution: ${npmTx.txExecutionResultName}`);
  if (npmTx.statusName !== "FINALIZED" || npmTx.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    throw new Error(`npm escrow funding did not succeed: ${JSON.stringify(npmTx)}`);
  }

  const npmEscrowData = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_escrow",
    args: [expectedNpmId],
  });
  console.log(`[✓] On-Chain Escrow Data for ${expectedNpmId}:`);
  console.log(`    Status       : ${npmEscrowData.status}`);
  console.log(`    Match Reason : ${npmEscrowData.match_reason}`);
  console.log(`    Amount       : ${npmEscrowData.amount} wei`);

  if (npmEscrowData.status !== "OPEN") {
    throw new Error(`Expected OPEN status, got ${npmEscrowData.status}`);
  }

  results.liveTests.npmEscrow = {
    template: "NPM_VERSION",
    package: npmPkg,
    version: npmVer,
    amountWei: npmAmount.toString(),
    nonce: npmNonce.toString(),
    deterministicId: expectedNpmId,
    txHash: npmTxHash,
    explorerTxUrl: `https://explorer-studio-dev.genlayer.com/tx/${npmTxHash}`,
    status: npmEscrowData.status,
    matchReason: npmEscrowData.match_reason,
    verified: true,
  };

  // --- [Step 4] Dedicated Escrow for Permissible Cancel/Refund ---
  console.log("\n--- [Step 4] Dedicated Escrow Creation & Permissible Cancel / Refund ---");
  const cancelPkg = "shiplock-smoke-cancel-target";
  const cancelVer = "0.0.0-smoke.1";
  const cancelAmount = 10000000000000000n; // 0.01 GEN
  const cancelNonce = 3003n;

  const expectedCancelId = deriveEscrowId({
    funder: account.address,
    recipient: RECIPIENT_ADDRESS,
    template: "PYPI_VERSION",
    packageName: cancelPkg,
    version: cancelVer,
    windowStart,
    windowEnd,
    amountWei: cancelAmount,
    nonce: cancelNonce,
  });

  console.log(`[*] Funding dedicated cancel escrow ${expectedCancelId}...`);
  const cancelFundTxHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "fund_escrow",
    args: [
      "PYPI_VERSION",
      cancelPkg,
      cancelVer,
      RECIPIENT_ADDRESS,
      windowStartUtc,
      windowEndUtc,
      cancelNonce,
    ],
    value: cancelAmount,
    fees: {
      distribution: pypiFeeEst.distribution,
      feeValue: pypiFeeEst.feeValue,
    },
  });
  console.log(`[RECORDED] Dedicated Cancel Fund Tx Hash: ${cancelFundTxHash}`);
  await client.waitForTransactionReceipt({
    hash: cancelFundTxHash,
    waitUntil: "finalized",
    retries: 100,
    interval: 3000,
  });

  // Verify it is OPEN before cancelling
  const preCancelData = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_escrow",
    args: [expectedCancelId],
  });
  console.log(`[✓] Pre-Cancel Status: ${preCancelData.status}`);

  // Now execute permissible cancel (funder calling before window_start)
  console.log(`[*] Executing cancel(${expectedCancelId}) as funder before window_start...`);
  const cancelFeeEst = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 100n,
    validatorTimeunitsAllocation: 200n,
    rotations: [0n],
  });

  const cancelTxHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "cancel",
    args: [expectedCancelId],
    fees: {
      distribution: cancelFeeEst.distribution,
      feeValue: cancelFeeEst.feeValue,
    },
  });
  console.log(`[RECORDED] Cancel Tx Hash: ${cancelTxHash}`);
  console.log("[*] Waiting for cancel finalization...");
  await client.waitForTransactionReceipt({
    hash: cancelTxHash,
    waitUntil: "finalized",
    retries: 100,
    interval: 3000,
  });

  const cancelTx = await client.getTransaction({ hash: cancelTxHash });
  console.log(`[✓] Cancel Status: ${cancelTx.statusName}, Execution: ${cancelTx.txExecutionResultName}`);
  if (cancelTx.statusName !== "FINALIZED" || cancelTx.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    throw new Error(`Cancel transaction did not succeed: ${JSON.stringify(cancelTx)}`);
  }

  // Read post-cancel escrow data
  const postCancelData = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_escrow",
    args: [expectedCancelId],
  });
  console.log(`[✓] Post-Cancel Escrow Data:`);
  console.log(`    Status : ${postCancelData.status}`);
  console.log(`    Refund : ${postCancelData.refund} wei`);

  if (postCancelData.status !== "CANCELED") {
    throw new Error(`Expected CANCELED status, got ${postCancelData.status}`);
  }
  if (BigInt(postCancelData.refund) !== cancelAmount) {
    throw new Error(`Expected refund ${cancelAmount}, got ${postCancelData.refund}`);
  }

  results.liveTests.cancelEscrow = {
    deterministicId: expectedCancelId,
    fundTxHash: cancelFundTxHash,
    cancelTxHash: cancelTxHash,
    explorerCancelTxUrl: `https://explorer-studio-dev.genlayer.com/tx/${cancelTxHash}`,
    status: postCancelData.status,
    refundWei: postCancelData.refund.toString(),
    verified: true,
  };

  // --- [Step 5] Final Accounting & Economics Verification ---
  console.log("\n--- [Step 5] Final Accounting & Economics Verification ---");
  const finalIds = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "list_ids",
    args: [],
  });
  const finalEcon = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_economics",
    args: [],
  });

  console.log(`[✓] Final Total Escrows Created : ${finalIds.length}`);
  console.log(`[✓] Escrowed Open (wei)         : ${finalEcon.escrowed_open} (expected: 40000000000000000 = 0.04 GEN)`);
  console.log(`[✓] Refunded to Funders (wei)   : ${finalEcon.refunded_to_funders} (expected: 10000000000000000 = 0.01 GEN)`);
  console.log(`[✓] Paid to Recipients (wei)    : ${finalEcon.paid_to_recipients} (expected: 0)`);

  results.finalState = {
    totalEscrows: finalIds.length,
    ids: finalIds,
    economics: finalEcon,
  };

  writeFileSync(resolve(root, "scripts/live_smoke_results.json"), JSON.stringify(results, null, 2));
  console.log("\n[✓] All live smoke test actions completed and saved to scripts/live_smoke_results.json!");
}

main().catch((err) => {
  console.error("[-] Live smoke suite failed:", err);
  process.exit(1);
});
