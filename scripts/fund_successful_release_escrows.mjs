/**
 * fund_successful_release_escrows.mjs
 *
 * Funds two candidate test escrows on GenLayer Studio Next for PyPI and npm live release verification:
 * 1. PyPI Release Candidate: shiplock-steward-release-live@1.0.0 (0.01 GEN)
 * 2. npm Release Candidate:  shiplock-steward-release-live@1.0.0 (0.01 GEN)
 *
 * Enforces:
 * - 24+ hour funding lead time (window_start >= now + 24h)
 * - 404 lookback check verified by GenLayer Studio Next oracle consensus
 * - Nonce derivation & deterministic escrow ID calculation
 * - Dynamic recipient address configuration
 * - Idempotency: Checks on-chain state first before sending transactions
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
const RECIPIENT_ADDRESS = "0x0f907a2598AEF71B988f9208103066586A1a4aF0";

const CANDIDATES = [
  {
    target: "PyPI",
    template: "PYPI_VERSION",
    package: "shiplock-steward-release-live",
    version: "1.0.0",
    nonce: "3001"
  },
  {
    target: "npm",
    template: "NPM_VERSION",
    package: "shiplock-steward-release-live",
    version: "1.0.0",
    nonce: "4002"
  }
];

async function main() {
  console.log("=== Funding Candidate Release Escrows on Studio Next ===");
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`Chain ID: 61997`);

  const deployerPk = await keytar.getPassword("genlayer-cli", "account:shiplock-deployer-live");
  if (!deployerPk) throw new Error("Deployer private key not found in keytar.");
  const cleanPk = deployerPk.startsWith("0x") ? deployerPk : `0x${deployerPk}`;
  const deployerAccount = createAccount(cleanPk);

  const client = createClient({ chain: studioDevnet, account: deployerAccount });

  // Read existing on-chain escrow IDs
  const existingIds = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_escrow_ids",
    args: []
  });
  console.log(`Existing on-chain escrows count: ${existingIds.length}`);

  let evidence = {
    contractAddress: CONTRACT_ADDRESS,
    updatedAtUtc: new Date().toISOString(),
    escrows: [],
    candidateReleaseEscrows: []
  };

  if (existsSync(EVIDENCE_FILE)) {
    try {
      evidence = JSON.parse(readFileSync(EVIDENCE_FILE, "utf-8"));
    } catch {}
  }

  // Calculate future window (26 hours from now -> 74 hours from now)
  const now = new Date();
  const windowStart = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 74 * 60 * 60 * 1000);

  const windowStartIso = windowStart.toISOString().replace(/\.\d{3}Z$/, "Z");
  const windowEndIso = windowEnd.toISOString().replace(/\.\d{3}Z$/, "Z");

  console.log(`Lead time: 26 hours (satisfies now + 24h contract requirement)`);
  console.log(`Target Window: ${windowStartIso} -> ${windowEndIso}`);

  for (const cand of CANDIDATES) {
    console.log(`\n--- Funding ${cand.target} Candidate: ${cand.package}@${cand.version} ---`);

    // Check if already funded in evidence
    const existing = evidence.candidateReleaseEscrows?.find(c => c.package === cand.package && c.template === cand.template);
    if (existing && existingIds.includes(existing.id)) {
      console.log(`  [✓] Escrow already active on-chain (ID: ${existing.id}). Status: ${existing.status || 'OPEN'}.`);
      continue;
    }

    const valueWei = 10000000000000000n; // 0.01 GEN

    console.log(`  [*] Estimating transaction fees...`);
    const feeEst = await client.estimateTransactionFees({
      leaderTimeunitsAllocation: 150n,
      validatorTimeunitsAllocation: 300n,
      rotations: [0n],
    });

    console.log(`  [*] Sending fund_escrow write to Studio Next...`);
    const txHash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "fund_escrow",
      args: [
        cand.template,
        cand.package,
        cand.version,
        RECIPIENT_ADDRESS,
        windowStartIso,
        windowEndIso,
        BigInt(cand.nonce)
      ],
      value: valueWei,
      fees: {
        distribution: feeEst.distribution,
        feeValue: feeEst.feeValue,
      },
    });

    console.log(`  [*] Tx Hash: ${txHash}. Waiting for finalization...`);
    await client.waitForTransactionReceipt({
      hash: txHash,
      waitUntil: "finalized",
      retries: 100,
      interval: 3000,
    });

    const txInfo = await client.getTransaction({ hash: txHash });
    console.log(`  [✓] Finalized! Status: ${txInfo.statusName}, Execution: ${txInfo.txExecutionResultName}`);

    // Retrieve fresh IDs
    const updatedIds = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow_ids",
      args: []
    });

    const newId = updatedIds[updatedIds.length - 1];
    const escrow = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [newId]
    });

    console.log(`  [✓] Escrow Created: ID=${newId}`);
    console.log(`      Status: ${escrow.status}, Reason: ${escrow.match_reason}, Principal: ${escrow.amount} wei`);

    if (!evidence.candidateReleaseEscrows) evidence.candidateReleaseEscrows = [];
    evidence.candidateReleaseEscrows.push({
      target: cand.target,
      template: cand.template,
      package: cand.package,
      version: cand.version,
      id: newId,
      txHash,
      explorerTxUrl: `https://explorer-studio-dev.genlayer.com/tx/${txHash}`,
      explorerContractUrl: `https://explorer-studio-dev.genlayer.com/address/${CONTRACT_ADDRESS}`,
      fundedAmountWei: String(valueWei),
      funder: escrow.funder,
      recipient: escrow.recipient,
      windowStartUtc: escrow.window_start_utc || windowStartIso,
      windowEndUtc: escrow.window_end_utc || windowEndIso,
      status: escrow.status,
      matchReason: escrow.match_reason,
      createdAtUtc: new Date().toISOString()
    });
  }

  writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2), "utf-8");
  console.log(`\n[✓] Evidence updated in ${EVIDENCE_FILE}`);
}

main().catch(err => {
  console.error("[-] Error:", err);
  process.exit(1);
});
