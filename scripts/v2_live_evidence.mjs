/**
 * v2_live_evidence.mjs
 *
 * ShipLock Phase C: Dedicated, Fail-Closed Live-Evidence Harness for
 * SOURCE_LINKED Multi-Source Release Escrows on GenLayer Studio Next.
 *
 * Security & Integrity Invariants:
 * 1. Strict Contract Binding:
 *    - Dynamically loads and verifies active contract from scripts/latest_deployment.json.
 *    - Fails closed unless address === 0xF2110c3E6B170caF10FE953564285C6f01cB1F0c.
 *    - Fails closed unless chainId === 61997.
 *    - Manifest fields (deployerAddress, rpcUrl, transactionHash) are mandatory; no fallbacks.
 *    - Never uses any fallback or legacy contract address.
 * 2. Secret Protection:
 *    - Preflight and reconcile modes NEVER load keychain secrets or private keys.
 *    - Fund and release modes access OS keychain (genlayer-cli) only when SHIPLOCK_LIVE_WRITE=YES.
 *    - Secrets are kept exclusively in volatile memory; never printed, logged, serialized, or exported.
 * 3. Economic & Principal Safety Limits:
 *    - Maximum 0.01 GEN (10^16 wei) principal per escrow.
 *    - Maximum 0.02 GEN (2*10^16 wei) cumulative principal across all Phase C cases.
 *    - Authoritative fee estimation before write; post-fee wallet balance reserve of at least
 *      0.05 GEN (5*10^16 wei) strictly enforced before submitting any funding transaction.
 * 4. Idempotency & Crash Resilience:
 *    - Dedicated evidence state file: scripts/v2_steward_evidence.json (never touches v1 evidence).
 *    - Atomically persists PREPARED intent before writeContract, and SUBMITTED hash immediately after.
 *    - On restart, checks for existing derived escrow on-chain and reconciles existing hashes; never resubmits.
 * 5. Strict Dual-Source Consensus & Allocation Trees:
 *    - Enforces 11-element preimage deterministic escrow ID derivation matching contracts/shiplock.py.
 *    - Verifies created escrow by comparing exact before/after on-chain ID sets.
 *    - Complete audit verification of all 16 escrow fields + economics delta on funding and release.
 *    - Caller role separation: release submitter (account:coverlock-submitter) != funder.
 *    - Strict Studio Next RPC block-time checking (fail closed if unavailable).
 *    - Complete two-root release message allocation trees covering recipient payout and funder refund.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { createRequire } from "node:module";

import {
  validateGithubRepo,
  validateGithubTag,
  normalizeGithubRepoUrl,
  parseGithubReleaseMetadata,
  queryRegistryMetadata,
  parseNpmMetadata,
  parsePypiVersionMetadata,
  atomicWriteJson,
  readJsonSafe,
  buildReleaseMessageAllocations,
  validateTransferAllocations,
  getRpcTime,
  verifyEmittedTransferOrChildTx,
  verifyEconomicsDelta,
  serializeEscrow,
  serializeEconomics,
} from "./evidence_helper.mjs";

const require = createRequire(import.meta.url);
const rootDir = resolve(import.meta.dirname, "..");

// GenLayer SDK imports
const { createClient } = require(resolve(rootDir, "web/node_modules/genlayer-js/dist/index.js"));
const { studioDevnet } = require(resolve(rootDir, "web/node_modules/genlayer-js/dist/chains/index.js"));
const { privateKeyToAccount } = require(resolve(rootDir, "web/node_modules/viem/accounts"));

export const REQUIRED_CONTRACT_ADDRESS = "0xF2110c3E6B170caF10FE953564285C6f01cB1F0c";
export const REQUIRED_CHAIN_ID = 61997;
export const RPC_ENDPOINT = "https://studio-dev.genlayer.com/api";

export const PRINCIPAL_PER_ESCROW_WEI = 10000000000000000n; // 0.01 GEN
export const MAX_CUMULATIVE_PRINCIPAL_WEI = 20000000000000000n; // 0.02 GEN
export const MIN_SAFETY_RESERVE_WEI = 50000000000000000n; // 0.05 GEN

export const MANIFEST_PATH = resolve(rootDir, "scripts/latest_deployment.json");
export const EXAMPLE_CONFIG_PATH = resolve(rootDir, "scripts/v2_evidence_config.example.json");
export const LOCAL_CONFIG_PATH = resolve(rootDir, "scripts/v2_evidence_config.local.json");
export const EVIDENCE_STATE_PATH = resolve(rootDir, "scripts/v2_steward_evidence.json");
export const V1_EVIDENCE_PATH = resolve(rootDir, "scripts/steward_evidence.json");

export const CONCLUSIVE_MISMATCH_REASONS = [
  "REGISTRY_REPO_MISMATCH",
  "GITHUB_TAG_MISMATCH",
  "GITHUB_REPO_MISMATCH",
  "WINDOW_EXPIRED_GITHUB_NO_RELEASE",
  "WINDOW_EXPIRED_NO_RELEASE",
  "YANKED",
  "PUBLISHED_BEFORE_WINDOW",
  "PUBLISHED_AFTER_WINDOW",
  "GITHUB_RELEASE_BEFORE_WINDOW",
  "GITHUB_RELEASE_AFTER_WINDOW",
];

/**
 * Validates and binds to the active contract deployment manifest.
 * Fails closed on any missing field without fallbacks.
 */
export function loadContractBinding({ manifestPath = MANIFEST_PATH } = {}) {
  if (!existsSync(manifestPath)) {
    throw new Error(`Deployment manifest not found at ${manifestPath}. Cannot bind contract.`);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse deployment manifest at ${manifestPath}: ${err.message}`);
  }

  const contractAddress = manifest.contractAddress;
  const chainId = Number(manifest.chainId);
  const rpcUrl = manifest.rpcUrl;
  const deployerAddress = manifest.deployerAddress;
  const transactionHash = manifest.transactionHash;

  if (!contractAddress || typeof contractAddress !== "string") {
    throw new Error("Deployment manifest missing contractAddress field.");
  }
  if (!chainId || isNaN(chainId)) {
    throw new Error("Deployment manifest missing chainId field.");
  }
  if (!rpcUrl || typeof rpcUrl !== "string") {
    throw new Error("Deployment manifest missing rpcUrl field. Fallbacks prohibited.");
  }
  if (!deployerAddress || typeof deployerAddress !== "string") {
    throw new Error("Deployment manifest missing deployerAddress field. Fallbacks prohibited.");
  }
  if (!transactionHash || typeof transactionHash !== "string") {
    throw new Error("Deployment manifest missing transactionHash field.");
  }

  if (contractAddress.toLowerCase() !== REQUIRED_CONTRACT_ADDRESS.toLowerCase()) {
    throw new Error(
      `Contract binding violation: manifest address '${contractAddress}' does not match expected active v2 contract '${REQUIRED_CONTRACT_ADDRESS}'. Fallback to historical contracts is prohibited.`
    );
  }

  if (chainId !== REQUIRED_CHAIN_ID) {
    throw new Error(
      `Chain binding violation: manifest chainId '${chainId}' does not match expected Studio Next chainId '${REQUIRED_CHAIN_ID}'.`
    );
  }

  if (rpcUrl !== RPC_ENDPOINT) {
    throw new Error(
      `RPC binding violation: manifest rpcUrl '${rpcUrl}' does not match expected Studio Next RPC '${RPC_ENDPOINT}'.`
    );
  }

  if (deployerAddress.toLowerCase() !== "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084".toLowerCase()) {
    throw new Error(
      `Deployer binding violation: manifest deployerAddress '${deployerAddress}' does not match expected deployer '0x20E850BAaD26d763d4f691780D1BEBA01c8D6084'.`
    );
  }

  return {
    contractAddress: REQUIRED_CONTRACT_ADDRESS,
    chainId: REQUIRED_CHAIN_ID,
    rpcUrl,
    deployerAddress,
    transactionHash,
    deployedAt: manifest.deployedAt,
  };
}

/**
 * Determines whether case configuration contains example or test placeholders.
 */
export function isPlaceholderCoordinate(caseConfig, recipientAddress) {
  if (!caseConfig) return true;
  const pkg = String(caseConfig.package || "").toLowerCase();
  const repo = String(caseConfig.expectedRepo || "").toLowerCase();
  const tag = String(caseConfig.expectedTag || "").toLowerCase();
  const recipient = String(recipientAddress || "").toLowerCase();

  const isPlaceholderPkg =
    pkg.includes("example") ||
    pkg.includes("test-") ||
    pkg.includes("dummy") ||
    pkg.includes("candidate");
  const isPlaceholderRepo =
    repo.includes("example") ||
    repo.includes("test-org") ||
    repo.includes("test-repo") ||
    repo.includes("imposter-org") ||
    repo.startsWith("owner/repo");
  const isPlaceholderTag = tag.includes("example");
  const isPlaceholderRecipient =
    recipient === "0x0000000000000000000000000000000000000000" ||
    recipient === "0x0f907a2598aef71b988f9208103066586a1a4af0"; // tracked example address

  return isPlaceholderPkg || isPlaceholderRepo || isPlaceholderTag || isPlaceholderRecipient;
}

/**
 * Loads configuration and validates agreement with deployment manifest.
 */
export function loadConfig({
  configPath = null,
  localPath = LOCAL_CONFIG_PATH,
  manifest,
} = {}) {
  const binding = manifest || loadContractBinding();
  const usingLocal = !configPath && existsSync(localPath);
  const targetPath = configPath || (usingLocal ? localPath : EXAMPLE_CONFIG_PATH);

  if (!existsSync(targetPath)) {
    throw new Error(`Configuration file not found at ${targetPath}.`);
  }

  let config;
  try {
    config = JSON.parse(readFileSync(targetPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse config file at ${targetPath}: ${err.message}`);
  }

  if (!config.contractAddress || typeof config.contractAddress !== "string") {
    throw new Error("Configuration missing required contractAddress field.");
  }
  if (config.contractAddress.toLowerCase() !== binding.contractAddress.toLowerCase()) {
    throw new Error(
      `Config contract address mismatch: config specifies '${config.contractAddress}', but active deployment is '${binding.contractAddress}'.`
    );
  }
  if (config.chainId === undefined || config.chainId === null || isNaN(Number(config.chainId))) {
    throw new Error("Configuration missing required chainId field.");
  }
  if (Number(config.chainId) !== binding.chainId) {
    throw new Error(
      `Config chainId mismatch: config specifies '${config.chainId}', but active deployment is '${binding.chainId}'.`
    );
  }
  if (!config.rpcUrl || typeof config.rpcUrl !== "string") {
    throw new Error("Configuration missing required rpcUrl field.");
  }
  if (config.rpcUrl !== binding.rpcUrl) {
    throw new Error(
      `Config rpcUrl mismatch: config specifies '${config.rpcUrl}', but manifest specifies '${binding.rpcUrl}'.`
    );
  }
  if (!config.funderAddress || typeof config.funderAddress !== "string") {
    throw new Error("Configuration missing required funderAddress field.");
  }
  if (config.funderAddress.toLowerCase() !== binding.deployerAddress.toLowerCase()) {
    throw new Error(
      `Config funderAddress mismatch: config specifies '${config.funderAddress}', but manifest specifies '${binding.deployerAddress}'.`
    );
  }

  // Validate recipient address
  const recipient = String(config.recipientAddress || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    throw new Error(`Invalid recipientAddress '${recipient}': must be a valid 20-byte hex address.`);
  }
  if (recipient.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new Error("Recipient address cannot be the zero address.");
  }
  if (recipient.toLowerCase() === binding.deployerAddress.toLowerCase()) {
    throw new Error("Recipient address cannot be equal to the funder/deployer address.");
  }

  // Validate presence and distinctness of cases
  if (!config.cases || typeof config.cases !== "object") {
    throw new Error("Configuration must include 'cases' object.");
  }
  if (!config.cases.success || !config.cases.mismatch) {
    throw new Error("Configuration must define both 'success' and 'mismatch' cases.");
  }

  // Production distinct nonce enforcement
  const sNonce = String(config.cases.success.nonce || "").trim();
  const mNonce = String(config.cases.mismatch.nonce || "").trim();
  if (sNonce === mNonce) {
    throw new Error(
      `Duplicate nonce violation: success case (${sNonce}) and mismatch case (${mNonce}) must have distinct nonces.`
    );
  }

  return {
    config,
    usingLocal,
    sourcePath: targetPath,
  };
}

/**
 * Validates individual case parameters according to contract specifications.
 */
export function validateCaseConfig(
  caseConfig,
  funderAddress,
  { forLiveWrite = false, recipientAddress } = {}
) {
  if (!caseConfig || typeof caseConfig !== "object") {
    throw new Error("Case configuration must be an object.");
  }

  const {
    template,
    package: pkg,
    version,
    expectedRepo,
    expectedTag,
    amountWei,
    windowLeadHours,
    windowDurationHours,
    nonce,
  } = caseConfig;

  if (template !== "NPM_VERSION" && template !== "PYPI_VERSION") {
    throw new Error(`Unsupported template '${template}'. Must be NPM_VERSION or PYPI_VERSION.`);
  }

  if (!pkg || typeof pkg !== "string" || !pkg.trim()) {
    throw new Error("Package name cannot be empty.");
  }

  if (!version || typeof version !== "string" || !version.trim()) {
    throw new Error("Version cannot be empty.");
  }

  const repoCheck = validateGithubRepo(expectedRepo);
  if (!repoCheck.valid) {
    throw new Error(`Invalid expectedRepo '${expectedRepo}': ${repoCheck.error}`);
  }

  const tagCheck = validateGithubTag(expectedTag);
  if (!tagCheck.valid) {
    throw new Error(`Invalid expectedTag '${expectedTag}': ${tagCheck.error}`);
  }

  const amt = BigInt(amountWei ?? 0);
  if (amt !== PRINCIPAL_PER_ESCROW_WEI) {
    throw new Error(
      `Principal amount violation: case amount must be exactly 0.01 GEN (${PRINCIPAL_PER_ESCROW_WEI} wei), received ${amt} wei.`
    );
  }

  const lead = Number(windowLeadHours ?? 0);
  if (lead < 24) {
    throw new Error(`Window lead hours (${lead}) must be at least 24 hours to satisfy contract timing requirements.`);
  }

  const duration = Number(windowDurationHours ?? 0);
  if (duration < 24 || duration > 336) {
    throw new Error(`Window duration hours (${duration}) must be between 24 hours (1 day) and 336 hours (14 days).`);
  }

  if (nonce === undefined || nonce === null || String(nonce).trim() === "") {
    throw new Error("Nonce is required and must be distinct.");
  }
  let nonceBig;
  try {
    nonceBig = BigInt(nonce);
  } catch {
    throw new Error(`Invalid nonce '${nonce}': must be a valid integer.`);
  }
  if (nonceBig <= 0n || nonceBig >= 2n ** 256n) {
    throw new Error(`Nonce violation: nonce must be a positive u256 integer, got ${nonceBig}.`);
  }

  // Reject placeholder coordinates for live writes
  if (forLiveWrite && isPlaceholderCoordinate(caseConfig, recipientAddress)) {
    throw new Error(
      `Live funding rejected: placeholder coordinates detected (pkg="${pkg}", repo="${expectedRepo}"). Live writes strictly require real, operator-controlled coordinates in scripts/v2_evidence_config.local.json.`
    );
  }

  return {
    valid: true,
    canonicalRepo: repoCheck.normalized,
    canonicalTag: tagCheck.normalized,
  };
}

/**
 * Calculates deterministic UTC ISO timestamps for escrow window with exact second precision.
 */
export function calculateWindowTimes(windowLeadHours, windowDurationHours, baseDate = new Date()) {
  const baseMs = baseDate.getTime();
  const startMs = baseMs + Number(windowLeadHours) * 3600 * 1000;
  const endMs = startMs + Number(windowDurationHours) * 3600 * 1000;

  const startDate = new Date(startMs);
  const endDate = new Date(endMs);

  const startUtc = startDate.toISOString().split(".")[0] + "Z";
  const endUtc = endDate.toISOString().split(".")[0] + "Z";

  return {
    startUtc,
    endUtc,
    startDate,
    endDate,
  };
}

/**
 * Derives deterministic 11-element preimage escrow ID matching contracts/shiplock.py:fund_verified_escrow.
 */
export function deriveV2EscrowId({
  funder,
  recipient,
  template,
  package_name,
  version,
  expected_repo,
  expected_tag,
  window_start_utc,
  window_end_utc,
  amount_wei,
  nonce,
}) {
  const funderHex = funder.trim().toLowerCase();
  const payeeHex = recipient.trim().toLowerCase();
  const tmpl = template.trim();
  const pkg = package_name.trim();
  const ver = version.trim();
  const repo = expected_repo.trim().toLowerCase();
  const tag = expected_tag.trim();
  const startIso = new Date(window_start_utc).toISOString().split(".")[0] + "Z";
  const endIso = new Date(window_end_utc).toISOString().split(".")[0] + "Z";
  const amtStr = BigInt(amount_wei).toString();
  const nonceStr = BigInt(nonce).toString();

  const preimage = `${funderHex}|${payeeHex}|${tmpl}|${pkg}|${ver}|${repo}|${tag}|${startIso}|${endIso}|${amtStr}|${nonceStr}`;
  const hash = crypto.createHash("sha256").update(Buffer.from(preimage, "utf8")).digest("hex");
  return `0x${hash}`;
}

/**
 * Builds a complete release message allocation tree covering both recipient and funder.
 */
export function buildV2ReleaseAllocations({ recipient, funder, budget = 150000000000000n }) {
  return buildReleaseMessageAllocations({ recipient, funder, budget });
}

/**
 * Validates that total cumulative Phase C principal does not exceed cap (0.02 GEN).
 */
export function checkCumulativeCap(
  evidence,
  newPrincipalWei = PRINCIPAL_PER_ESCROW_WEI,
  maxCumulativeWei = MAX_CUMULATIVE_PRINCIPAL_WEI
) {
  let existingSum = 0n;
  if (evidence && evidence.cases) {
    for (const key of Object.keys(evidence.cases)) {
      const c = evidence.cases[key];
      if (c && c.writeInputs?.amountWei) {
        existingSum += BigInt(c.writeInputs.amountWei);
      } else if (c && c.principalWei) {
        existingSum += BigInt(c.principalWei);
      }
    }
  }

  const projectedSum = existingSum + BigInt(newPrincipalWei);
  if (projectedSum > BigInt(maxCumulativeWei)) {
    throw new Error(
      `Cumulative principal cap violation: projected total (${projectedSum} wei) exceeds Phase C cap (${maxCumulativeWei} wei).`
    );
  }
  return projectedSum;
}

/**
 * Verifies deployer wallet balance maintains the required post-fee safety reserve buffer.
 */
export function checkBalanceReserve(
  balanceWei,
  amountWei,
  feeEstimateWei = 0n,
  minReserveWei = MIN_SAFETY_RESERVE_WEI
) {
  const totalRequired = BigInt(amountWei) + BigInt(feeEstimateWei) + BigInt(minReserveWei);
  const bal = BigInt(balanceWei);
  if (bal < totalRequired) {
    throw new Error(
      `Insufficient wallet balance: current balance is ${bal} wei (${Number(bal) / 1e18} GEN). Required: ${totalRequired} wei (${Number(totalRequired) / 1e18} GEN) to cover principal (${Number(amountWei) / 1e18} GEN), estimated fees (${Number(feeEstimateWei) / 1e18} GEN), and safety reserve (${Number(minReserveWei) / 1e18} GEN). Aborting before write.`
    );
  }
  return true;
}

/**
 * Validates transaction receipt status and execution result strictly fail-closed.
 */
export function verifyReceiptFinalizedSuccess(receipt) {
  if (!receipt) {
    throw new Error("Transaction receipt is missing or null");
  }
  const status = receipt.statusName ?? receipt.status_name ?? receipt.status;
  if (status !== "FINALIZED" && status !== 7 && status !== "7") {
    throw new Error(`Transaction was not finalized: status=${status}`);
  }
  const exec = receipt.txExecutionResultName ?? receipt.tx_execution_result_name ?? receipt.txExecutionResult;
  if (exec !== "FINISHED_WITH_RETURN" && exec !== 1 && exec !== "1" && exec !== "SUCCESS") {
    throw new Error(`Transaction execution failed closed: result=${exec}`);
  }
  return { finalized: true, success: true, status, exec };
}

/**
 * Verifies that the on-chain escrow immutable identity fields match expected inputs.
 * Separates historical contract preimage binding from mutable lifecycle status.
 */
export function verifyEscrowImmutableIdentity({ escrowData, expectedInputs }) {
  if (!escrowData || typeof escrowData !== "object") {
    throw new Error("Audit failure: on-chain escrow data is missing or invalid.");
  }
  if (!expectedInputs || typeof expectedInputs !== "object") {
    throw new Error("Audit failure: expected inputs are missing or invalid.");
  }

  const expectedPolicy = expectedInputs.policy ?? "SOURCE_LINKED";
  if (escrowData.policy !== expectedPolicy) {
    throw new Error(`Audit failure: policy mismatch (expected '${expectedPolicy}', got '${escrowData.policy}').`);
  }

  if (escrowData.template !== expectedInputs.template) {
    throw new Error(`Audit failure: template mismatch (expected '${expectedInputs.template}', got '${escrowData.template}').`);
  }

  const pkg = escrowData.package_name ?? escrowData.package;
  const expectedPkg = expectedInputs.package ?? expectedInputs.packageName ?? expectedInputs.package_name;
  if (pkg !== expectedPkg) {
    throw new Error(`Audit failure: package mismatch (expected '${expectedPkg}', got '${pkg}').`);
  }

  if (escrowData.version !== expectedInputs.version) {
    throw new Error(`Audit failure: version mismatch (expected '${expectedInputs.version}', got '${escrowData.version}').`);
  }

  const expRepo = expectedInputs.expectedRepo ?? expectedInputs.expected_repo;
  if (String(escrowData.expected_repo || "").toLowerCase() !== String(expRepo || "").toLowerCase()) {
    throw new Error(`Audit failure: expected_repo mismatch (expected '${String(expRepo || "").toLowerCase()}', got '${escrowData.expected_repo}').`);
  }

  const expTag = expectedInputs.expectedTag ?? expectedInputs.expected_tag;
  if (String(escrowData.expected_tag || "") !== String(expTag || "")) {
    throw new Error(`Audit failure: expected_tag mismatch (expected '${expTag}', got '${escrowData.expected_tag}').`);
  }

  if (String(escrowData.funder || "").toLowerCase() !== String(expectedInputs.funder || "").toLowerCase()) {
    throw new Error(`Audit failure: funder mismatch (expected '${expectedInputs.funder}', got '${escrowData.funder}').`);
  }

  if (String(escrowData.recipient || "").toLowerCase() !== String(expectedInputs.recipient || "").toLowerCase()) {
    throw new Error(`Audit failure: recipient mismatch (expected '${expectedInputs.recipient}', got '${escrowData.recipient}').`);
  }

  const expAmount = BigInt(expectedInputs.amountWei ?? expectedInputs.amount ?? PRINCIPAL_PER_ESCROW_WEI);
  if (BigInt(escrowData.amount ?? 0) !== expAmount) {
    throw new Error(`Audit failure: amount mismatch (expected ${expAmount}, got '${escrowData.amount}').`);
  }

  if (BigInt(escrowData.nonce ?? 0) !== BigInt(expectedInputs.nonce)) {
    throw new Error(`Audit failure: nonce mismatch (expected '${expectedInputs.nonce}', got '${escrowData.nonce}').`);
  }

  const rawStart = expectedInputs.windowStartUtc ?? expectedInputs.window_start_utc;
  const rawEnd = expectedInputs.windowEndUtc ?? expectedInputs.window_end_utc;
  const startIso = new Date(rawStart).toISOString().split(".")[0] + "Z";
  const endIso = new Date(rawEnd).toISOString().split(".")[0] + "Z";
  const actualStartIso = new Date(escrowData.window_start_utc).toISOString().split(".")[0] + "Z";
  const actualEndIso = new Date(escrowData.window_end_utc).toISOString().split(".")[0] + "Z";
  if (actualStartIso !== startIso) {
    throw new Error(`Audit failure: window_start_utc mismatch (expected '${startIso}', got '${escrowData.window_start_utc}').`);
  }
  if (actualEndIso !== endIso) {
    throw new Error(`Audit failure: window_end_utc mismatch (expected '${endIso}', got '${escrowData.window_end_utc}').`);
  }

  return { verified: true };
}

/**
 * Verifies all 16 on-chain audit fields and economics delta for a newly funded verified escrow.
 */
export function verifyFundedEscrowAudit({
  escrowData,
  expectedInputs,
  econBefore,
  econAfter,
}) {
  verifyEscrowImmutableIdentity({ escrowData, expectedInputs });

  if (escrowData.status !== "OPEN") {
    throw new Error(`Audit failure: status mismatch (expected 'OPEN', got '${escrowData.status}').`);
  }
  if (escrowData.match_reason !== "LOOKBACK_404_OK") {
    throw new Error(`Audit failure: match_reason mismatch (expected 'LOOKBACK_404_OK', got '${escrowData.match_reason}').`);
  }
  if (BigInt(escrowData.payout ?? 0) !== 0n) {
    throw new Error(`Audit failure: payout must be 0 for OPEN escrow, got '${escrowData.payout}'.`);
  }
  if (BigInt(escrowData.refund ?? 0) !== 0n) {
    throw new Error(`Audit failure: refund must be 0 for OPEN escrow, got '${escrowData.refund}'.`);
  }

  // Economics checks
  if (econBefore && econAfter) {
    const openBefore = BigInt(econBefore.escrowed_open ?? 0);
    const openAfter = BigInt(econAfter.escrowed_open ?? 0);
    if (openAfter - openBefore !== PRINCIPAL_PER_ESCROW_WEI) {
      throw new Error(`Audit failure: escrowed_open economics delta must be +${PRINCIPAL_PER_ESCROW_WEI}, got +${openAfter - openBefore}.`);
    }
    const paidBefore = BigInt(econBefore.paid_to_recipients ?? 0);
    const paidAfter = BigInt(econAfter.paid_to_recipients ?? 0);
    if (paidBefore !== paidAfter) {
      throw new Error(`Audit failure: paid_to_recipients changed unexpectedly (${paidBefore} -> ${paidAfter}).`);
    }
    const refundBefore = BigInt(econBefore.refunded_to_funders ?? 0);
    const refundAfter = BigInt(econAfter.refunded_to_funders ?? 0);
    if (refundBefore !== refundAfter) {
      throw new Error(`Audit failure: refunded_to_funders changed unexpectedly (${refundBefore} -> ${refundAfter}).`);
    }
  }

  return { verified: true };
}

/**
 * Serializes transaction receipt into safe persisted format.
 */
export function serializeReceipt(receipt) {
  if (!receipt) return null;
  return {
    status: receipt.statusName ?? receipt.status,
    executionResult: receipt.txExecutionResultName ?? receipt.txExecutionResult,
    hash: receipt.hash ?? receipt.transactionHash,
    blockNumber: receipt.blockNumber ? receipt.blockNumber.toString() : null,
  };
}

/**
 * Fetches GitHub release information read-only.
 */
export async function queryGithubRelease(owner, repo, tag) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ShipLock-Live-Evidence-Harness/2.0",
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (res.status === 404) {
      return {
        exists: false,
        status_code: 404,
        kind: "404",
        error: "Release tag not found on GitHub",
        message: "Release tag not found on GitHub",
      };
    }
    if (!res.ok) {
      return {
        exists: false,
        status_code: res.status,
        kind: "http_error",
        error: `HTTP ${res.status}: ${res.statusText}`,
        message: `HTTP ${res.status}: ${res.statusText}`,
      };
    }
    const data = await res.json();
    const parsed = parseGithubReleaseMetadata(data, `${owner}/${repo}`, tag);
    const hasValidDate = Boolean(parsed.published_utc && !isNaN(new Date(parsed.published_utc).getTime()));
    const isSuccess =
      parsed.status_code === 200 &&
      parsed.kind === "200" &&
      parsed.tag_name === tag &&
      !parsed.draft &&
      !parsed.prerelease &&
      hasValidDate;

    return {
      exists: isSuccess,
      status_code: parsed.status_code,
      kind: parsed.kind,
      tag_name: parsed.tag_name,
      published_utc: parsed.published_utc,
      draft: parsed.draft,
      prerelease: parsed.prerelease,
      error: parsed.error || (isSuccess ? null : `Inconclusive or invalid release: kind=${parsed.kind}, draft=${parsed.draft}, prerelease=${parsed.prerelease}`),
      message: parsed.error || (isSuccess ? "Valid release" : parsed.kind),
      raw: data,
    };
  } catch (err) {
    return {
      exists: false,
      status_code: 0,
      kind: "network_error",
      error: err.message,
      message: err.message,
    };
  }
}

/**
 * Accesses OS keychain secret in volatile memory only.
 */
async function getKeychainSecret(service, account) {
  let keytar;
  try {
    keytar = require(resolve(rootDir, "web/node_modules/keytar"));
  } catch {
    const { homedir } = require("os");
    keytar = require(resolve(homedir(), "AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar"));
  }
  const secret = await keytar.getPassword(service, account);
  if (!secret) {
    throw new Error(`Secret not found in OS keychain for service '${service}', account '${account}'.`);
  }
  return secret;
}

/**
 * MODE A: preflight (Strictly Read-Only — No Keys, No Writes)
 */
export async function runPreflight({
  client: injectedClient,
  manifest: injectedManifest,
  config: injectedConfig,
  evidencePath = EVIDENCE_STATE_PATH,
  queryRegistryFn = queryRegistryMetadata,
  queryGithubFn = queryGithubRelease,
} = {}) {
  console.log("============================================================");
  console.log("ShipLock v2 Live Evidence — Read-Only Preflight Verification");
  console.log("============================================================\n");

  const manifest = injectedManifest || loadContractBinding();
  const { config, usingLocal, sourcePath } = injectedConfig ? { config: injectedConfig, usingLocal: false, sourcePath: "injected" } : loadConfig({ manifest });

  console.log(`[+] Bound Contract Address : ${manifest.contractAddress}`);
  console.log(`[+] Required Chain ID       : ${manifest.chainId} (Studio Next)`);
  console.log(`[+] RPC Endpoint            : ${manifest.rpcUrl}`);
  console.log(`[+] Deployer Public Address : ${manifest.deployerAddress}`);
  console.log(`[+] Loaded Configuration    : ${sourcePath} (Local override: ${usingLocal})`);

  const client = injectedClient || createClient({
    chain: studioDevnet,
    endpoint: manifest.rpcUrl,
  });

  // 1. Contract State & Code Read Verification
  console.log("\n--- 1. Contract State & Code Read Verification ---");
  const code = await client.getContractCode(manifest.contractAddress);
  if (!code || code.length === 0) {
    throw new Error(`Contract at ${manifest.contractAddress} has empty on-chain code!`);
  }
  console.log(`[✓] On-Chain Code Length    : ${code.length} characters (Non-empty, Verified)`);

  const escrowIds = await client.readContract({
    address: manifest.contractAddress,
    functionName: "get_escrow_ids",
    args: [],
  });
  console.log(`[✓] Current Escrow Count    : ${escrowIds.length}`);

  const economics = await client.readContract({
    address: manifest.contractAddress,
    functionName: "get_economics",
    args: [],
  });
  console.log(
    `[✓] Current Economics       : open=${economics.escrowed_open} wei, paid=${economics.paid_to_recipients} wei, refunded=${economics.refunded_to_funders} wei`
  );

  // 2. Deployer Wallet Balance Check
  console.log("\n--- 2. Deployer Wallet Balance Check ---");
  const balance = await client.getBalance({ address: manifest.deployerAddress });
  const balanceWei = BigInt(balance);
  const balanceGen = Number(balanceWei) / 1e18;
  console.log(`[+] Deployer Public Address : ${manifest.deployerAddress}`);
  console.log(`[+] Wallet Balance          : ${balanceGen.toFixed(4)} GEN (${balanceWei} wei)`);

  const requiredBuffer = PRINCIPAL_PER_ESCROW_WEI + MIN_SAFETY_RESERVE_WEI;
  if (balanceWei < requiredBuffer) {
    throw new Error(
      `Insufficient deployer wallet balance: ${balanceGen.toFixed(4)} GEN. Required >= ${Number(requiredBuffer) / 1e18} GEN to safely fund Phase C escrows while preserving the 0.05 GEN reserve.`
    );
  }
  console.log(`[✓] Safety Reserve Buffer   : PASS (Balance >= 0.01 GEN + 0.05 GEN reserve buffer)`);

  // 3. Phase C Target Cases Preflight Validation
  console.log("\n--- 3. Phase C Target Cases Preflight Validation ---");
  const blockers = [];
  const caseReadiness = {
    success: false,
    mismatch: false,
  };

  // Distinct nonce check
  try {
    const nonceSuccess = BigInt(config.cases?.success?.nonce ?? 0);
    const nonceMismatch = BigInt(config.cases?.mismatch?.nonce ?? 0);
    if (nonceSuccess === nonceMismatch) {
      blockers.push("Case nonces must be distinct");
    }
  } catch {
    blockers.push("Invalid nonce configuration");
  }

  for (const key of ["success", "mismatch"]) {
    const c = config.cases[key];
    console.log(`\nCase [${key.toUpperCase()}]: ${c.name}`);
    let validationPassed = false;
    let isPlaceholder = true;
    let registryConclusivelyAbsent = false;

    try {
      validateCaseConfig(c, manifest.deployerAddress, { recipientAddress: config.recipientAddress });
      validationPassed = true;
      console.log(`  [✓] Local Config Validation : PASS (Repo: ${c.expectedRepo}, Tag: ${c.expectedTag})`);
      console.log(`  [✓] Principal Amount        : 0.01 GEN (${c.amountWei} wei)`);
      console.log(`  [✓] Nonce Check             : PASS (${c.nonce})`);

      const window = calculateWindowTimes(c.windowLeadHours, c.windowDurationHours);
      console.log(`  [✓] Proposed Window Timing  : Start: ${window.startUtc} (in ${c.windowLeadHours}h) -> End: ${window.endUtc}`);

      // Query package registry read-only
      console.log(`  [*] Querying Registry Endpoint: ${c.template} (${c.package}@${c.version})...`);
      const regMeta = await queryRegistryFn(c.template, c.package, c.version);
      if (regMeta.exists || regMeta.kind === "200") {
        console.log(`      Registry Check Result   : Package exists (Published: ${regMeta.publishTime}, Repo: ${regMeta.normalizedRepo || "none"})`);
        blockers.push(`Case [${key.toUpperCase()}]: package ${c.package}@${c.version} already published on registry - funding lookback will fail`);
      } else if (regMeta.isYanked) {
        console.log(`      Registry Check Result   : Package is yanked`);
        blockers.push(`Case [${key.toUpperCase()}]: package ${c.package}@${c.version} is yanked on registry - funding lookback will fail`);
      } else if (regMeta.statusCode === 404 && regMeta.kind === "404") {
        console.log(`      Registry Check Result   : ${regMeta.summary || "Package not found (HTTP 404)"}`);
        registryConclusivelyAbsent = true;
      } else {
        console.log(`      Registry Check Result   : Inconclusive (${regMeta.kind} / HTTP ${regMeta.statusCode})`);
        blockers.push(`Case [${key.toUpperCase()}]: registry response is inconclusive or unavailable (${regMeta.kind} / HTTP ${regMeta.statusCode})`);
      }

      // Query GitHub Releases read-only
      const [owner, repoName] = c.expectedRepo.split("/");
      console.log(`  [*] Querying GitHub Releases Endpoint: ${c.expectedRepo} release tag '${c.expectedTag}'...`);
      const ghMeta = await queryGithubFn(owner, repoName, c.expectedTag);
      if (ghMeta.exists) {
        console.log(`      GitHub Check Result     : GitHub release found (Tag: ${ghMeta.tag_name}, Published: ${ghMeta.published_utc})`);
      } else {
        console.log(`      GitHub Check Result     : GitHub release tag '${c.expectedTag}' not found on ${c.expectedRepo} (${ghMeta.message})`);
      }

      // Suitability and placeholder check
      console.log("  [*] Suitability Analysis:");
      isPlaceholder = isPlaceholderCoordinate(c, config.recipientAddress);
      if (isPlaceholder) {
        blockers.push(`Case [${key.toUpperCase()}]: placeholder coordinates detected (${c.package} / ${c.expectedRepo})`);
        console.log(`      -> Placeholder coordinates detected (${c.package} / ${c.expectedRepo}). Safe for preflight verification.`);
        console.log("      -> For live funding, operator must provide real controlled coordinates in v2_evidence_config.local.json.");
      } else {
        if (key === "success") {
          console.log(`      -> Lookback Suitability : ${registryConclusivelyAbsent ? "READY TO FUND (Package is absent, lookback check will pass)" : "WARNING: Package already published or inconclusive"}`);
        } else {
          console.log(`      -> Mismatch Suitability : Suitable for negative mismatch proof.`);
        }
      }
    } catch (err) {
      validationPassed = false;
      blockers.push(`Case [${key.toUpperCase()}]: validation error: ${err.message}`);
      console.log(`  [-] Validation Failed       : ${err.message}`);
    }

    caseReadiness[key] = validationPassed && !isPlaceholder && registryConclusivelyAbsent;
  }

  // 4. Evidence State File Isolation
  console.log("\n--- 4. Evidence State File Isolation ---");
  if (!existsSync(evidencePath)) {
    console.log(`[!] State file ${evidencePath} does not exist yet. It will be initialized cleanly.`);
  } else {
    const ev = readJsonSafe(evidencePath);
    if (ev?.contractAddress && ev.contractAddress.toLowerCase() !== manifest.contractAddress.toLowerCase()) {
      throw new Error(`Evidence state file bound to foreign contract: ${ev.contractAddress}`);
    }
    console.log(`[✓] State file exists and is cleanly bound to: ${manifest.contractAddress}`);
  }

  const readyForLiveWrites = caseReadiness.success && caseReadiness.mismatch && blockers.length === 0;
  console.log("\n============================================================");
  if (readyForLiveWrites) {
    console.log("PREFLIGHT COMPLETE — READY FOR LIVE WRITES (0 TRANSACTIONS SUBMITTED)");
  } else {
    console.log(`PREFLIGHT COMPLETE — NOT READY FOR LIVE WRITES (${blockers.length} blocker(s)) (READ-ONLY)`);
    for (const b of blockers) {
      console.log(`  [!] ${b}`);
    }
  }
  console.log("============================================================\n");

  return {
    success: true,
    readyForLiveWrites,
    caseReadiness,
    blockers,
    manifest,
    balanceWei,
    escrowIds,
  };
}

/**
 * MODE B: fund (Implementation — Guarded by SHIPLOCK_LIVE_WRITE=YES)
 */
export async function runFund({
  client: injectedClient,
  manifest: injectedManifest,
  config: injectedConfig,
  caseName,
  evidencePath = EVIDENCE_STATE_PATH,
  getKeychainSecretFn = getKeychainSecret,
  deployerAccount: injectedDeployerAccount,
} = {}) {
  if (process.env.SHIPLOCK_LIVE_WRITE !== "YES") {
    throw new Error(
      "Safety interlock active: SHIPLOCK_LIVE_WRITE=YES is strictly required to execute on-chain funding transactions."
    );
  }

  if (!caseName || (caseName !== "success" && caseName !== "mismatch")) {
    throw new Error("Explicit case selector (--case=success or --case=mismatch) is strictly required.");
  }

  const manifest = injectedManifest || loadContractBinding();
  const { config } = injectedConfig ? { config: injectedConfig } : loadConfig({ manifest });

  const caseConfig = config.cases?.[caseName];
  if (!caseConfig) {
    throw new Error(`Case configuration for '${caseName}' not found.`);
  }

  // Strictly reject placeholder coordinates in live fund mode
  const { canonicalRepo, canonicalTag } = validateCaseConfig(caseConfig, manifest.deployerAddress, {
    forLiveWrite: true,
    recipientAddress: config.recipientAddress,
  });

  // Load existing evidence state
  let evidence = readJsonSafe(evidencePath) || {
    contractAddress: manifest.contractAddress,
    chainId: manifest.chainId,
    rpcUrl: manifest.rpcUrl,
    policy: "SOURCE_LINKED",
    cases: { success: null, mismatch: null },
    history: [],
  };

  if (evidence.contractAddress.toLowerCase() !== manifest.contractAddress.toLowerCase()) {
    throw new Error(`Evidence state file bound to mismatched contract: ${evidence.contractAddress}`);
  }

  // Reconstruct inputs from persisted intent if available (Crash Recovery), else calculate new window
  const existingCase = evidence.cases?.[caseName];
  let windowStartUtc;
  let windowEndUtc;
  let nonce;
  let expectedEscrowId;

  const persistedInputs = existingCase?.writeInputs || existingCase?.funding?.writeInputs;
  if (persistedInputs) {
    // Reconstruct exclusively from persisted intent
    windowStartUtc = persistedInputs.windowStartUtc;
    windowEndUtc = persistedInputs.windowEndUtc;
    nonce = persistedInputs.nonce;
    const pkg = persistedInputs.package || persistedInputs.packageName;
    expectedEscrowId = existingCase.escrowId || deriveV2EscrowId({
      funder: manifest.deployerAddress,
      recipient: persistedInputs.recipient,
      template: persistedInputs.template,
      package_name: pkg,
      version: persistedInputs.version,
      expected_repo: persistedInputs.expectedRepo,
      expected_tag: persistedInputs.expectedTag,
      window_start_utc: windowStartUtc,
      window_end_utc: windowEndUtc,
      amount_wei: BigInt(persistedInputs.amountWei || PRINCIPAL_PER_ESCROW_WEI),
      nonce,
    });

    // Verify current local config still agrees with the persisted intent
    if (
      caseConfig.template !== persistedInputs.template ||
      caseConfig.package !== pkg ||
      caseConfig.version !== persistedInputs.version ||
      canonicalRepo.toLowerCase() !== persistedInputs.expectedRepo.toLowerCase() ||
      canonicalTag !== persistedInputs.expectedTag ||
      String(caseConfig.nonce) !== String(nonce) ||
      config.recipientAddress.toLowerCase() !== persistedInputs.recipient.toLowerCase()
    ) {
      throw new Error(
        `Persisted funding intent for '${caseName}' disagrees with current local configuration. Operator must reconcile or resolve explicitly before writing.`
      );
    }
  } else {
    // Brand new intent: calculate window times from current clock
    const windowTimes = calculateWindowTimes(caseConfig.windowLeadHours, caseConfig.windowDurationHours);
    windowStartUtc = windowTimes.startUtc;
    windowEndUtc = windowTimes.endUtc;
    nonce = caseConfig.nonce;
    expectedEscrowId = deriveV2EscrowId({
      funder: manifest.deployerAddress,
      recipient: config.recipientAddress,
      template: caseConfig.template,
      package_name: caseConfig.package,
      version: caseConfig.version,
      expected_repo: canonicalRepo,
      expected_tag: canonicalTag,
      window_start_utc: windowStartUtc,
      window_end_utc: windowEndUtc,
      amount_wei: PRINCIPAL_PER_ESCROW_WEI,
      nonce,
    });
  }

  const client = injectedClient || createClient({
    chain: studioDevnet,
    endpoint: manifest.rpcUrl,
  });

  // Crash Recovery & Duplicate Submission Prevention
  if (existingCase?.funding?.txHash) {
    console.log(`[🔍 RECOVERY] Found previously recorded funding hash for '${caseName}': ${existingCase.funding.txHash}. Reconciling...`);
    const receipt = await client.getTransactionReceipt({ hash: existingCase.funding.txHash });
    verifyReceiptFinalizedSuccess(receipt);

    const onChainEscrow = await client.readContract({
      address: manifest.contractAddress,
      functionName: "get_escrow",
      args: [expectedEscrowId],
    });

    const expectedInputs = existingCase.writeInputs || {
      template: caseConfig.template,
      package: caseConfig.package,
      version: caseConfig.version,
      expectedRepo: canonicalRepo,
      expectedTag: canonicalTag,
      funder: manifest.deployerAddress,
      recipient: config.recipientAddress,
      nonce,
      windowStartUtc,
      windowEndUtc,
    };

    if (onChainEscrow) {
      verifyEscrowImmutableIdentity({
        escrowData: onChainEscrow,
        expectedInputs,
      });
      if (!["OPEN", "RELEASED", "REFUND_NOHIT"].includes(onChainEscrow.status)) {
        throw new Error(`Recovery audit failure: unexpected on-chain escrow status '${onChainEscrow.status}'.`);
      }
    }

    if (existingCase.onChainAudit && existingCase.postEconomicsSnapshot && existingCase.preEconomicsSnapshot) {
      verifyFundedEscrowAudit({
        escrowData: existingCase.onChainAudit,
        expectedInputs,
        econBefore: existingCase.preEconomicsSnapshot,
        econAfter: existingCase.postEconomicsSnapshot,
      });
      existingCase.state = "VERIFIED";
      existingCase.funding.status = "FINALIZED";
      existingCase.funding.proofStatus = "VERIFIED";
      existingCase.funding.verified = true;
      atomicWriteJson(evidencePath, evidence);
      console.log(`[✓] Existing transaction successfully verified without duplicate submission.`);
      return { success: true, txHash: existingCase.funding.txHash, escrowId: expectedEscrowId, reconciled: true };
    } else {
      // Historical snapshots missing: fail closed without reconstructing from current aggregate economics
      existingCase.state = "PROOF_INCOMPLETE";
      existingCase.funding.status = "FINALIZED";
      existingCase.funding.proofStatus = "PROOF_INCOMPLETE";
      existingCase.funding.verified = false;
      atomicWriteJson(evidencePath, evidence);
      console.log(`[!] Existing funding transaction lacks required historical snapshots. Marking PROOF_INCOMPLETE without duplicate write.`);
      return {
        success: false,
        proofStatus: "PROOF_INCOMPLETE",
        txHash: existingCase.funding.txHash,
        escrowId: expectedEscrowId,
        reconciled: true,
        reason: "missing_historical_snapshots",
      };
    }
  }

  // If PREPARED without txHash, check whether expected escrow was already created on-chain
  if (existingCase?.state === "PREPARED") {
    let existingEscrow = null;
    try {
      existingEscrow = await client.readContract({
        address: manifest.contractAddress,
        functionName: "get_escrow",
        args: [expectedEscrowId],
      });
    } catch {
      // Escrow does not exist yet on-chain; safe to proceed with new write
    }

    if (existingEscrow && existingEscrow.status === "OPEN") {
      console.log(`[🔍 RECOVERY] Interrupted PREPARED state detected: expected escrow ${expectedEscrowId} already exists on-chain. Verifying without duplicate write...`);
      const currentEcon = await client.readContract({
        address: manifest.contractAddress,
        functionName: "get_economics",
        args: [],
      });
      verifyFundedEscrowAudit({
        escrowData: existingEscrow,
        expectedInputs: {
          template: caseConfig.template,
          package: caseConfig.package,
          version: caseConfig.version,
          expectedRepo: canonicalRepo,
          expectedTag: canonicalTag,
          funder: manifest.deployerAddress,
          recipient: config.recipientAddress,
          nonce,
          windowStartUtc,
          windowEndUtc,
        },
        econBefore: existingCase.preEconomicsSnapshot,
        econAfter: currentEcon,
      });

      existingCase.state = "VERIFIED";
      existingCase.reconciledWithoutTxHash = true;
      atomicWriteJson(evidencePath, evidence);
      return { success: true, escrowId: expectedEscrowId, reconciled: true };
    }
  }

  // Check cumulative Phase C principal limit
  checkCumulativeCap(evidence, PRINCIPAL_PER_ESCROW_WEI, MAX_CUMULATIVE_PRINCIPAL_WEI);

  // Retrieve deployer balance
  const balance = await client.getBalance({ address: manifest.deployerAddress });
  const balanceWei = BigInt(balance);

  // Capture on-chain baseline before write
  const beforeIds = await client.readContract({
    address: manifest.contractAddress,
    functionName: "get_escrow_ids",
    args: [],
  });
  const econBefore = await client.readContract({
    address: manifest.contractAddress,
    functionName: "get_economics",
    args: [],
  });

  // Estimate transaction fees authoritatively BEFORE signing
  console.log(`[*] Estimating transaction fees for fund_verified_escrow on Studio Next...`);
  const feeEst = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 200n,
    validatorTimeunitsAllocation: 400n,
    rotations: [1n],
    value: PRINCIPAL_PER_ESCROW_WEI,
  });
  const estimatedFeeWei = BigInt(feeEst.feeValue ?? 0);

  // Strictly enforce post-fee balance reserve
  checkBalanceReserve(balanceWei, PRINCIPAL_PER_ESCROW_WEI, estimatedFeeWei, MIN_SAFETY_RESERVE_WEI);

  // Atomically persist PREPARED intent BEFORE wallet signing
  evidence.cases[caseName] = {
    state: "PREPARED",
    caseName,
    escrowId: expectedEscrowId,
    writeInputs: {
      template: caseConfig.template,
      package: caseConfig.package,
      packageName: caseConfig.package,
      version: caseConfig.version,
      expectedRepo: canonicalRepo,
      expectedTag: canonicalTag,
      recipient: config.recipientAddress,
      funder: manifest.deployerAddress,
      windowStartUtc,
      windowEndUtc,
      nonce,
      amountWei: PRINCIPAL_PER_ESCROW_WEI.toString(),
    },
    beforeIds,
    preEconomicsSnapshot: serializeEconomics(econBefore),
    balanceWei: balanceWei.toString(),
    estimatedFeeWei: estimatedFeeWei.toString(),
    safetyReserveWei: MIN_SAFETY_RESERVE_WEI.toString(),
    preparedAtUtc: new Date().toISOString(),
  };
  atomicWriteJson(evidencePath, evidence);

  // Retrieve deployer private key into volatile memory unless injected
  let deployerAccount = injectedDeployerAccount || (injectedClient?.account?.address ? injectedClient.account : null);
  if (!deployerAccount) {
    const deployerPk = await getKeychainSecretFn(
      config.keychainService || "genlayer-cli",
      config.deployerAccount || "account:shiplock-deployer-live"
    );
    const cleanPk = typeof deployerPk === "string" && deployerPk.startsWith("0x") ? deployerPk : `0x${deployerPk}`;
    deployerAccount = privateKeyToAccount(cleanPk);
  }

  if (deployerAccount.address.toLowerCase() !== manifest.deployerAddress.toLowerCase()) {
    throw new Error(
      `Keychain account address '${deployerAccount.address}' does not match manifest deployer '${manifest.deployerAddress}'.`
    );
  }

  // Create client with deployer account
  const writeClient = injectedClient || createClient({
    chain: studioDevnet,
    endpoint: manifest.rpcUrl,
    account: deployerAccount,
  });

  console.log(`[*] Submitting fund_verified_escrow for case '${caseName}'...`);
  const txHash = await writeClient.writeContract({
    address: manifest.contractAddress,
    functionName: "fund_verified_escrow",
    args: [
      caseConfig.template,
      caseConfig.package,
      caseConfig.version,
      canonicalRepo,
      canonicalTag,
      config.recipientAddress,
      windowStartUtc,
      windowEndUtc,
      BigInt(nonce),
    ],
    value: PRINCIPAL_PER_ESCROW_WEI,
    fees: {
      distribution: feeEst.distribution,
      feeValue: feeEst.feeValue,
    },
  });

  // Immediately persist SUBMITTED state with txHash BEFORE awaiting finalization
  evidence.cases[caseName].state = "SUBMITTED";
  evidence.cases[caseName].funding = {
    txHash,
    status: "SUBMITTED",
    submittedAtUtc: new Date().toISOString(),
    writeInputs: evidence.cases[caseName].writeInputs,
  };
  atomicWriteJson(evidencePath, evidence);
  console.log(`[+] Funding transaction submitted: ${txHash}`);

  console.log(`[*] Awaiting finalization on Studio Next...`);
  const receipt = await writeClient.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
  });

  const receiptStatus = receipt.statusName ?? receipt.status;
  const execResult = receipt.txExecutionResultName ?? receipt.txExecutionResult;

  if (receiptStatus !== "FINALIZED") {
    evidence.cases[caseName].state = "PENDING";
    evidence.cases[caseName].funding.status = receiptStatus;
    evidence.cases[caseName].funding.executionResult = execResult ?? "UNKNOWN";
    evidence.cases[caseName].funding.receipt = serializeReceipt(receipt);
    atomicWriteJson(evidencePath, evidence);
    throw new Error(`Transaction was not finalized: status=${receiptStatus}`);
  }

  if (execResult !== "FINISHED_WITH_RETURN" && execResult !== "SUCCESS") {
    evidence.cases[caseName].state = "FINALIZED_FAILED";
    evidence.cases[caseName].funding.status = receiptStatus;
    evidence.cases[caseName].funding.executionResult = execResult;
    evidence.cases[caseName].funding.receipt = serializeReceipt(receipt);
    atomicWriteJson(evidencePath, evidence);
    throw new Error(`Transaction execution failed closed: result=${execResult}`);
  }

  // Concurrency-Safe Escrow Discovery: Query expected escrow ID directly
  const escrowData = await writeClient.readContract({
    address: manifest.contractAddress,
    functionName: "get_escrow",
    args: [expectedEscrowId],
  });

  if (!escrowData || !escrowData.policy) {
    throw new Error(`Expected escrow ${expectedEscrowId} not found on-chain after finalized funding receipt.`);
  }

  // Supplementary: inspect before/after ID-set difference without failing on concurrent escrows
  const afterIds = await writeClient.readContract({
    address: manifest.contractAddress,
    functionName: "get_escrow_ids",
    args: [],
  });

  const diffIds = afterIds.filter((id) => !beforeIds.some((b) => b.toLowerCase() === id.toLowerCase()));
  const concurrentIds = diffIds.filter((id) => id.toLowerCase() !== expectedEscrowId.toLowerCase());
  if (concurrentIds.length > 0) {
    console.log(`[ℹ️ CONCURRENCY] Concurrent unrelated escrow(s) detected during funding: ${JSON.stringify(concurrentIds)}`);
    evidence.cases[caseName].concurrentEscrowIds = concurrentIds;
  }

  const onChainEscrowId = expectedEscrowId;

  // Read post-economics
  const econAfter = await writeClient.readContract({
    address: manifest.contractAddress,
    functionName: "get_economics",
    args: [],
  });

  // Full 16-field audit verification + economics delta
  verifyFundedEscrowAudit({
    escrowData,
    expectedInputs: {
      template: caseConfig.template,
      package: caseConfig.package,
      version: caseConfig.version,
      expectedRepo: canonicalRepo,
      expectedTag: canonicalTag,
      funder: manifest.deployerAddress,
      recipient: config.recipientAddress,
      nonce,
      windowStartUtc,
      windowEndUtc,
    },
    econBefore,
    econAfter,
  });

  // Update verified evidence atomically
  evidence.cases[caseName].state = "VERIFIED";
  evidence.cases[caseName].funding.status = "FINALIZED";
  evidence.cases[caseName].funding.executionResult = receipt.txExecutionResultName ?? "FINISHED_WITH_RETURN";
  evidence.cases[caseName].funding.verifiedAtUtc = new Date().toISOString();
  evidence.cases[caseName].onChainAudit = serializeEscrow(escrowData);
  evidence.cases[caseName].postEconomicsSnapshot = serializeEconomics(econAfter);

  evidence.history.push({
    action: "fund_verified",
    caseName,
    txHash,
    escrowId: onChainEscrowId,
    timestampUtc: new Date().toISOString(),
  });

  atomicWriteJson(evidencePath, evidence);
  console.log(`[✓] Funding verified successfully for case '${caseName}' (Escrow: ${onChainEscrowId})`);

  return {
    success: true,
    txHash,
    escrowId: onChainEscrowId,
    receipt,
  };
}

/**
 * MODE C: reconcile (Truthfully Reconciles Funding & Release Lifecycle States)
 */
export async function runReconcile({
  client: injectedClient,
  manifest: injectedManifest,
  evidencePath = EVIDENCE_STATE_PATH,
  verifyTransferFn = verifyEmittedTransferOrChildTx,
} = {}) {
  console.log("=== Reconciling v2 Steward Evidence ===");
  const manifest = injectedManifest || loadContractBinding();
  const evidence = readJsonSafe(evidencePath);

  if (!evidence || !evidence.cases) {
    console.log("[*] No v2 evidence state found to reconcile.");
    return {
      inspected: 0,
      verified: 0,
      pending: 0,
      failed: 0,
      proofIncomplete: 0,
      reconciled: 0,
    };
  }

  const client = injectedClient || createClient({
    chain: studioDevnet,
    endpoint: manifest.rpcUrl,
  });

  let inspected = 0;
  let verified = 0;
  let pending = 0;
  let failed = 0;
  let proofIncomplete = 0;

  for (const caseKey of ["success", "mismatch"]) {
    const c = evidence.cases[caseKey];
    if (!c) continue;

    console.log(`\nReconciling Case [${caseKey.toUpperCase()}]: ${c.escrowId || "unassigned"}`);

    // Reconcile Funding Record
    if (c.funding?.txHash) {
      inspected++;
      try {
        const receipt = await client.getTransactionReceipt({ hash: c.funding.txHash });
        if (!receipt) {
          c.funding.proofStatus = "PROOF_INCOMPLETE";
          proofIncomplete++;
        } else {
          const status = receipt.statusName ?? receipt.status;
          const exec = receipt.txExecutionResultName ?? receipt.txExecutionResult;

          if (status !== "FINALIZED") {
            c.funding.state = "PENDING";
            c.funding.proofStatus = "PENDING_FINALIZATION";
            pending++;
          } else if (exec !== "FINISHED_WITH_RETURN" && exec !== "SUCCESS") {
            c.funding.state = "FINALIZED_FAILED";
            c.funding.proofStatus = "EXECUTION_FAILED";
            failed++;
          } else {
            // Receipt finalized success. Run full verifyFundedEscrowAudit on historical snapshots
            const writeInputs = c.writeInputs || c.funding.writeInputs;
            const preEcon = c.preEconomicsSnapshot;
            const postEcon = c.postEconomicsSnapshot;
            const onChainAudit = c.onChainAudit;

            // Missing snapshot check: report PROOF_INCOMPLETE honestly. Never reconstruct from current aggregate economics.
            if (!c.escrowId || !writeInputs || !preEcon || !postEcon || !onChainAudit) {
              c.funding.proofStatus = "PROOF_INCOMPLETE";
              proofIncomplete++;
            } else {
              let auditPassed = false;
              try {
                // 1. Validate persisted writeInputs against persisted immediate post-funding onChainAudit snapshot
                // and validate historical funding economics delta: preEconomicsSnapshot -> postEconomicsSnapshot
                verifyFundedEscrowAudit({
                  escrowData: onChainAudit,
                  expectedInputs: writeInputs,
                  econBefore: preEcon,
                  econAfter: postEcon,
                });
                auditPassed = true;
              } catch (auditErr) {
                console.log(`  Historical funding audit mismatch: ${auditErr.message}`);
                c.funding.proofStatus = "PROOF_INCOMPLETE";
                proofIncomplete++;
              }

              if (auditPassed) {
                try {
                  // 2. Query current live escrow
                  const currentEscrow = await client.readContract({
                    address: manifest.contractAddress,
                    functionName: "get_escrow",
                    args: [c.escrowId],
                  });

                  if (!currentEscrow) {
                    throw new Error(`Current escrow '${c.escrowId}' not found on-chain.`);
                  }

                  // 3. Verify its immutable identity fields still match:
                  // policy, template, package, version, expected_repo, expected_tag,
                  // funder, recipient, amount, nonce, window_start_utc, window_end_utc
                  verifyEscrowImmutableIdentity({
                    escrowData: currentEscrow,
                    expectedInputs: writeInputs,
                  });

                  // 4. Permit valid later lifecycle states, including OPEN, RELEASED, and REFUND_NOHIT
                  const validLifecycleStates = ["OPEN", "RELEASED", "REFUND_NOHIT"];
                  if (!validLifecycleStates.includes(currentEscrow.status)) {
                    throw new Error(`Audit failure: current escrow status '${currentEscrow.status}' is not permitted.`);
                  }

                  // Keep funding proof VERIFIED
                  c.funding.state = "VERIFIED";
                  c.funding.proofStatus = "VERIFIED";
                  c.currentLifecycleStatus = currentEscrow.status;
                  c.currentEscrowSnapshot = serializeEscrow(currentEscrow);
                  // Do NOT overwrite postEconomicsSnapshot with current economics during later reconciliation!
                  verified++;
                } catch (identErr) {
                  console.log(`  Current escrow immutable identity or status check failed: ${identErr.message}`);
                  c.funding.proofStatus = "PROOF_INCOMPLETE";
                  proofIncomplete++;
                }
              }
            }
          }
          console.log(`  Funding State   : ${c.funding.state} (Proof: ${c.funding.proofStatus})`);
        }
      } catch (err) {
        c.funding.proofStatus = "PROOF_INCOMPLETE";
        proofIncomplete++;
        console.log(`  Funding reconciliation warning: ${err.message}`);
      }
    }

    // Reconcile Release Record
    if (c.release?.txHash) {
      inspected++;
      try {
        const receipt = await client.getTransactionReceipt({ hash: c.release.txHash });
        if (!receipt) {
          c.release.proofStatus = "PROOF_INCOMPLETE";
          proofIncomplete++;
        } else {
          const status = receipt.statusName ?? receipt.status;
          const exec = receipt.txExecutionResultName ?? receipt.txExecutionResult;

          if (status !== "FINALIZED") {
            c.release.state = "PENDING";
            c.release.proofStatus = "PENDING_FINALIZATION";
            pending++;
          } else if (exec !== "FINISHED_WITH_RETURN" && exec !== "SUCCESS") {
            c.release.state = "FINALIZED_FAILED";
            c.release.proofStatus = "EXECUTION_FAILED";
            failed++;
          } else {
            const preEcon = c.release.preEconomicsSnapshot;
            const postEcon = c.release.postEconomicsSnapshot;
            if (!c.escrowId || !preEcon || !postEcon) {
              c.release.proofStatus = "PROOF_INCOMPLETE";
              proofIncomplete++;
            } else {
              const esc = await client.readContract({
                address: manifest.contractAddress,
                functionName: "get_escrow",
                args: [c.escrowId],
              });

              let settlementOk = false;
              if (caseKey === "success") {
                settlementOk =
                  esc.status === "RELEASED" &&
                  esc.match_reason === "VERIFIED_RELEASE" &&
                  BigInt(esc.payout ?? 0) === PRINCIPAL_PER_ESCROW_WEI;
                if (settlementOk) {
                  try {
                    verifyEconomicsDelta({
                      econBefore: preEcon,
                      econAfter: postEcon,
                      expectedType: "PAYOUT",
                      amountWei: PRINCIPAL_PER_ESCROW_WEI,
                    });
                  } catch {
                    settlementOk = false;
                  }
                }
              } else {
                settlementOk =
                  esc.status === "REFUND_NOHIT" &&
                  CONCLUSIVE_MISMATCH_REASONS.includes(esc.match_reason) &&
                  BigInt(esc.refund ?? 0) === PRINCIPAL_PER_ESCROW_WEI;
                if (settlementOk) {
                  try {
                    verifyEconomicsDelta({
                      econBefore: preEcon,
                      econAfter: postEcon,
                      expectedType: "REFUND",
                      amountWei: PRINCIPAL_PER_ESCROW_WEI,
                    });
                  } catch {
                    settlementOk = false;
                  }
                }
              }

              if (!settlementOk) {
                c.release.proofStatus = "PROOF_INCOMPLETE";
                proofIncomplete++;
              } else {
                let transferProof = { messageEmitted: false, fundsDelivered: false };
                try {
                  const expectedTarget = caseKey === "success" ? esc.recipient : esc.funder;
                  transferProof = await verifyTransferFn({
                    client,
                    txInfo: receipt,
                    step: c.release,
                    expectedTarget,
                    amountWei: PRINCIPAL_PER_ESCROW_WEI,
                    isPayout: caseKey === "success",
                    saveEvidence: () => atomicWriteJson(evidencePath, evidence),
                  });
                } catch {
                  // transfer proof incomplete
                }

                if (transferProof?.fundsDelivered) {
                  c.release.state = "VERIFIED";
                  c.release.proofStatus = "VERIFIED";
                  verified++;
                } else if (transferProof?.messageEmitted) {
                  c.release.state = "SETTLEMENT_VERIFIED_TRANSFER_PENDING";
                  c.release.proofStatus = "SETTLEMENT_VERIFIED_TRANSFER_PENDING";
                  proofIncomplete++;
                } else {
                  c.release.state = "PROOF_INCOMPLETE";
                  c.release.proofStatus = "PROOF_INCOMPLETE";
                  proofIncomplete++;
                }
                c.release.resultingStatus = esc.status;
                c.release.resultingMatchReason = esc.match_reason;
                c.release.transferProof = transferProof;
              }
            }
          }
          console.log(`  Release State   : ${c.release.state} (Proof: ${c.release.proofStatus})`);
        }
      } catch (err) {
        c.release.proofStatus = "PROOF_INCOMPLETE";
        proofIncomplete++;
        console.log(`  Release reconciliation warning: ${err.message}`);
      }
    }
  }

  atomicWriteJson(evidencePath, evidence);
  console.log(`\n[✓] Reconciliation complete. Inspected ${inspected} record(s): verified=${verified}, pending=${pending}, failed=${failed}, proofIncomplete=${proofIncomplete}.`);
  return {
    inspected,
    verified,
    pending,
    failed,
    proofIncomplete,
    reconciled: inspected,
  };
}

/**
 * MODE D: release (Implementation — Guarded by SHIPLOCK_LIVE_WRITE=YES)
 */
export async function runRelease({
  client: injectedClient,
  manifest: injectedManifest,
  config: injectedConfig,
  caseName,
  evidencePath = EVIDENCE_STATE_PATH,
  getKeychainSecretFn = getKeychainSecret,
  queryRegistryFn = queryRegistryMetadata,
  queryGithubFn = queryGithubRelease,
  getRpcTimeFn = getRpcTime,
  verifyTransferFn = verifyEmittedTransferOrChildTx,
  submitterAccount: injectedSubmitterAccount,
} = {}) {
  if (process.env.SHIPLOCK_LIVE_WRITE !== "YES") {
    throw new Error(
      "Safety interlock active: SHIPLOCK_LIVE_WRITE=YES is strictly required to execute release transactions."
    );
  }

  if (!caseName || (caseName !== "success" && caseName !== "mismatch")) {
    throw new Error("Explicit case selector (--case=success or --case=mismatch) is strictly required.");
  }

  const manifest = injectedManifest || loadContractBinding();
  const { config } = injectedConfig ? { config: injectedConfig } : loadConfig({ manifest });

  const evidence = readJsonSafe(evidencePath);
  const targetCase = evidence?.cases?.[caseName];
  if (!targetCase || !targetCase.escrowId) {
    throw new Error(`Case '${caseName}' has no funded escrow ID to release.`);
  }

  const client = injectedClient || createClient({
    chain: studioDevnet,
    endpoint: manifest.rpcUrl,
  });

  // Reconcile existing release hash first; never submit duplicate writes
  if (targetCase.release?.txHash) {
    console.log(`[🔍 RECOVERY] Found previously recorded release hash for '${caseName}': ${targetCase.release.txHash}. Reconciling...`);
    const receipt = await client.getTransactionReceipt({ hash: targetCase.release.txHash });
    if (!receipt) {
      targetCase.release.proofStatus = "PROOF_INCOMPLETE";
      atomicWriteJson(evidencePath, evidence);
      return { success: false, txHash: targetCase.release.txHash, proofStatus: "PROOF_INCOMPLETE", reconciled: true };
    }

    const receiptStatus = receipt.statusName ?? receipt.status;
    const execResult = receipt.txExecutionResultName ?? receipt.txExecutionResult;

    if (receiptStatus !== "FINALIZED") {
      targetCase.release.state = "PENDING";
      targetCase.release.proofStatus = "PENDING_FINALIZATION";
      targetCase.release.receipt = serializeReceipt(receipt);
      atomicWriteJson(evidencePath, evidence);
      return { success: false, txHash: targetCase.release.txHash, state: "PENDING", reconciled: true };
    }

    if (execResult !== "FINISHED_WITH_RETURN" && execResult !== "SUCCESS") {
      targetCase.release.state = "FINALIZED_FAILED";
      targetCase.release.proofStatus = "EXECUTION_FAILED";
      targetCase.release.executionResult = execResult;
      targetCase.release.receipt = serializeReceipt(receipt);
      atomicWriteJson(evidencePath, evidence);
      return { success: false, txHash: targetCase.release.txHash, state: "FINALIZED_FAILED", reconciled: true };
    }

    // Receipt is finalized success. Check snapshots and post state
    const preEcon = targetCase.release.preEconomicsSnapshot;
    const postEcon = targetCase.release.postEconomicsSnapshot;
    const postEscrow = await client.readContract({
      address: manifest.contractAddress,
      functionName: "get_escrow",
      args: [targetCase.escrowId],
    });

    if (!preEcon || !postEcon || !targetCase.release.preEscrowSnapshot) {
      targetCase.release.proofStatus = "PROOF_INCOMPLETE";
      targetCase.release.state = "PROOF_INCOMPLETE";
      targetCase.release.resultingStatus = postEscrow?.status;
      targetCase.release.resultingMatchReason = postEscrow?.match_reason;
      atomicWriteJson(evidencePath, evidence);
      return {
        success: false,
        txHash: targetCase.release.txHash,
        proofStatus: "PROOF_INCOMPLETE",
        reconciled: true,
        reason: "missing_historical_snapshots",
      };
    }

    // Verify case-specific status and match reason
    let statusOk = false;
    if (caseName === "success") {
      statusOk = postEscrow.status === "RELEASED" && postEscrow.match_reason === "VERIFIED_RELEASE" && BigInt(postEscrow.payout ?? 0) === PRINCIPAL_PER_ESCROW_WEI;
      if (statusOk) {
        verifyEconomicsDelta({
          econBefore: preEcon,
          econAfter: postEcon,
          expectedType: "PAYOUT",
          amountWei: PRINCIPAL_PER_ESCROW_WEI,
        });
      }
    } else {
      statusOk = postEscrow.status === "REFUND_NOHIT" && CONCLUSIVE_MISMATCH_REASONS.includes(postEscrow.match_reason) && BigInt(postEscrow.refund ?? 0) === PRINCIPAL_PER_ESCROW_WEI;
      if (statusOk) {
        verifyEconomicsDelta({
          econBefore: preEcon,
          econAfter: postEcon,
          expectedType: "REFUND",
          amountWei: PRINCIPAL_PER_ESCROW_WEI,
        });
      }
    }

    if (!statusOk) {
      targetCase.release.proofStatus = "PROOF_INCOMPLETE";
      targetCase.release.resultingStatus = postEscrow.status;
      targetCase.release.resultingMatchReason = postEscrow.match_reason;
      atomicWriteJson(evidencePath, evidence);
      return { success: false, txHash: targetCase.release.txHash, proofStatus: "PROOF_INCOMPLETE", reason: "status_or_reason_mismatch" };
    }

    // Check transfer proof
    let transferProof = { messageEmitted: false, fundsDelivered: false };
    try {
      const expectedTarget = caseName === "success" ? postEscrow.recipient : postEscrow.funder;
      transferProof = await verifyTransferFn({
        client,
        txInfo: receipt,
        step: targetCase.release,
        expectedTarget,
        amountWei: PRINCIPAL_PER_ESCROW_WEI,
        isPayout: caseName === "success",
        saveEvidence: () => atomicWriteJson(evidencePath, evidence),
      });
    } catch {
      // transfer proof incomplete
    }

    if (transferProof?.fundsDelivered) {
      targetCase.release.state = "VERIFIED";
      targetCase.release.proofStatus = "VERIFIED";
    } else if (transferProof?.messageEmitted) {
      targetCase.release.state = "SETTLEMENT_VERIFIED_TRANSFER_PENDING";
      targetCase.release.proofStatus = "SETTLEMENT_VERIFIED_TRANSFER_PENDING";
    } else {
      targetCase.release.state = "PROOF_INCOMPLETE";
      targetCase.release.proofStatus = "PROOF_INCOMPLETE";
    }

    targetCase.release.resultingStatus = postEscrow.status;
    targetCase.release.resultingMatchReason = postEscrow.match_reason;
    targetCase.release.transferProof = transferProof;
    if (!targetCase.release.postEscrowSnapshot) {
      targetCase.release.postEscrowSnapshot = serializeEscrow(postEscrow);
    }
    atomicWriteJson(evidencePath, evidence);
    return {
      success: targetCase.release.state === "VERIFIED",
      txHash: targetCase.release.txHash,
      escrowId: targetCase.escrowId,
      state: targetCase.release.state,
      proofStatus: targetCase.release.proofStatus,
      reconciled: true,
    };
  }

  // Load submitter private key from OS keychain unless injected
  let submitterAccount = injectedSubmitterAccount || (injectedClient?.account?.address ? injectedClient.account : null);
  if (!submitterAccount) {
    const submitterPk = await getKeychainSecretFn(
      config.keychainService || "genlayer-cli",
      config.submitterAccount || "account:coverlock-submitter"
    );
    const cleanPk = typeof submitterPk === "string" && submitterPk.startsWith("0x") ? submitterPk : `0x${submitterPk}`;
    submitterAccount = privateKeyToAccount(cleanPk);
  }

  // Enforce caller role separation: submitter cannot be the funder
  if (submitterAccount.address.toLowerCase() === manifest.deployerAddress.toLowerCase()) {
    throw new Error(
      `Caller role violation: release caller '${submitterAccount.address}' cannot be the funder address '${manifest.deployerAddress}'.`
    );
  }

  // Verify escrow is OPEN on-chain
  const esc = await client.readContract({
    address: manifest.contractAddress,
    functionName: "get_escrow",
    args: [targetCase.escrowId],
  });

  if (esc.status !== "OPEN") {
    throw new Error(`Escrow ${targetCase.escrowId} is in status '${esc.status}', expected 'OPEN'.`);
  }

  // Fail closed if RPC time cannot be obtained
  const rpcTime = await getRpcTimeFn(client, { failClosed: true });
  const startDt = new Date(esc.window_start_utc);
  const endDt = new Date(esc.window_end_utc);
  const expDt = new Date(esc.expire_at_utc);

  // Case-specific timing and evidence checks
  if (caseName === "success") {
    // Success write timing requires: window_start <= RPC time < expire_at
    if (rpcTime < startDt) {
      throw new Error(
        `Timing violation: escrow window has not opened yet (RPC time ${rpcTime.toISOString()} < window_start ${esc.window_start_utc}).`
      );
    }
    if (rpcTime >= expDt) {
      throw new Error(
        `Timing violation: escrow has expired (RPC time ${rpcTime.toISOString()} >= expire_at ${esc.expire_at_utc}).`
      );
    }

    // Source Evidence Gates: Query live package registry & GitHub releases
    const [owner, repoName] = esc.expected_repo.split("/");
    const regMeta = await queryRegistryFn(esc.template, esc.package_name, esc.version);
    const ghMeta = await queryGithubFn(owner, repoName, esc.expected_tag);

    // Validate registry evidence using exact camelCase contract
    if (!regMeta || typeof regMeta !== "object") {
      throw new Error("Source evidence gate failed: malformed registry metadata response.");
    }
    if (!regMeta.exists || regMeta.statusCode !== 200 || regMeta.kind !== "200") {
      throw new Error(
        `Source evidence gate failed for registry: package not verified (${regMeta.kind || "404"} / HTTP ${regMeta.statusCode}).`
      );
    }
    if (regMeta.isYanked) {
      throw new Error("Source evidence gate failed for registry: package is yanked.");
    }
    if (!regMeta.publishTime || isNaN(new Date(regMeta.publishTime).getTime())) {
      throw new Error(
        `Source evidence gate failed: registry publication time '${regMeta.publishTime}' is invalid.`
      );
    }
    if (typeof regMeta.normalizedRepo !== "string" || regMeta.normalizedRepo.toLowerCase() !== esc.expected_repo.toLowerCase()) {
      throw new Error(
        `Source evidence gate failed: registry repository '${regMeta.normalizedRepo}' does not match expected '${esc.expected_repo}'.`
      );
    }
    const regPubDt = new Date(regMeta.publishTime);
    if (regPubDt < startDt || regPubDt > endDt) {
      throw new Error(
        `Source evidence gate failed: registry publication time ${regMeta.publishTime} is outside escrow window [${esc.window_start_utc}, ${esc.window_end_utc}].`
      );
    }

    // Validate GitHub release evidence
    if (!ghMeta || typeof ghMeta !== "object") {
      throw new Error("Source evidence gate failed: malformed GitHub release metadata response.");
    }
    if (!ghMeta.exists || ghMeta.status_code !== 200 || ghMeta.kind !== "200") {
      throw new Error(
        `Source evidence gate failed for GitHub: release not verified (${ghMeta.message || ghMeta.kind || "404"}).`
      );
    }
    if (ghMeta.draft) {
      throw new Error("Source evidence gate failed for GitHub: release is marked draft.");
    }
    if (ghMeta.prerelease) {
      throw new Error("Source evidence gate failed for GitHub: release is marked prerelease.");
    }
    if (ghMeta.tag_name !== esc.expected_tag) {
      throw new Error(
        `Source evidence gate failed: GitHub tag '${ghMeta.tag_name}' does not match expected '${esc.expected_tag}'.`
      );
    }
    if (!ghMeta.published_utc || isNaN(new Date(ghMeta.published_utc).getTime())) {
      throw new Error(
        `Source evidence gate failed: GitHub release time '${ghMeta.published_utc}' is invalid.`
      );
    }
    const ghPubDt = new Date(ghMeta.published_utc);
    if (ghPubDt < startDt || ghPubDt > endDt) {
      throw new Error(
        `Source evidence gate failed: GitHub release time ${ghMeta.published_utc} is outside escrow window [${esc.window_start_utc}, ${esc.window_end_utc}].`
      );
    }
  } else if (caseName === "mismatch") {
    // For mismatch refund proof: window must have closed
    if (rpcTime < endDt) {
      throw new Error(
        `Timing violation: escrow window is still open (RPC time ${rpcTime.toISOString()} < window_end ${esc.window_end_utc}). During active window, mismatch remains OPEN and retryable. Conclusive settlement for REFUND_NOHIT requires window_end <= RPC time < expire_at.`
      );
    }
    if (rpcTime >= expDt) {
      throw new Error(`Timing violation: escrow is past expire_at (${esc.expire_at_utc}).`);
    }
  }

  // Capture pre-release baseline
  const preEconomics = await client.readContract({
    address: manifest.contractAddress,
    functionName: "get_economics",
    args: [],
  });

  // Build complete two-root message allocation tree covering both recipient and funder
  const completeAllocations = buildV2ReleaseAllocations({
    recipient: esc.recipient,
    funder: esc.funder,
    budget: 150000000000000n,
  });

  const feeEst = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 200n,
    validatorTimeunitsAllocation: 400n,
    rotations: [1n],
    messageAllocations: completeAllocations,
  });

  // Requirement 6: Read only feeEst.messageAllocations as authoritative result.
  // Do NOT fall back silently to locally supplied roots.
  const authoritativeAllocations = feeEst?.messageAllocations;
  if (!Array.isArray(authoritativeAllocations) || authoritativeAllocations.length === 0) {
    throw new Error("Fee estimation failed to return authoritative messageAllocations.");
  }

  // Validate coverage of recipient and funder in returned allocations
  validateTransferAllocations({
    functionName: "release",
    distribution: feeEst.distribution,
    messageAllocations: authoritativeAllocations,
    mustHaveTransfer: true,
    expectedRecipients: [esc.recipient, esc.funder],
  });

  // Atomically persist PREPARED release intent before submission
  targetCase.release = {
    state: "PREPARED",
    preEscrowSnapshot: serializeEscrow(esc),
    preEconomicsSnapshot: serializeEconomics(preEconomics),
    preparedAtUtc: new Date().toISOString(),
  };
  atomicWriteJson(evidencePath, evidence);

  const writeClient = injectedClient || createClient({
    chain: studioDevnet,
    endpoint: manifest.rpcUrl,
    account: submitterAccount,
  });

  console.log(`[*] Submitting release transaction for escrow ${targetCase.escrowId}...`);
  const txHash = await writeClient.writeContract({
    address: manifest.contractAddress,
    functionName: "release",
    args: [targetCase.escrowId],
    fees: {
      distribution: feeEst.distribution,
      feeValue: feeEst.feeValue,
      messageAllocations: authoritativeAllocations,
    },
  });

  targetCase.release.state = "SUBMITTED";
  targetCase.release.txHash = txHash;
  targetCase.release.submittedAtUtc = new Date().toISOString();
  atomicWriteJson(evidencePath, evidence);
  console.log(`[+] Release transaction submitted: ${txHash}`);

  console.log(`[*] Awaiting finalization on Studio Next...`);
  const receipt = await writeClient.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
  });

  const receiptStatus = receipt.statusName ?? receipt.status;
  const execResult = receipt.txExecutionResultName ?? receipt.txExecutionResult;

  if (receiptStatus !== "FINALIZED") {
    targetCase.release.state = "PENDING";
    targetCase.release.status = receiptStatus;
    targetCase.release.executionResult = execResult ?? "UNKNOWN";
    targetCase.release.receipt = serializeReceipt(receipt);
    atomicWriteJson(evidencePath, evidence);
    throw new Error(`Release transaction was not finalized: status=${receiptStatus}`);
  }

  if (execResult !== "FINISHED_WITH_RETURN" && execResult !== "SUCCESS") {
    targetCase.release.state = "FINALIZED_FAILED";
    targetCase.release.status = receiptStatus;
    targetCase.release.executionResult = execResult;
    targetCase.release.receipt = serializeReceipt(receipt);
    atomicWriteJson(evidencePath, evidence);
    throw new Error(`Release transaction execution failed closed: result=${execResult}`);
  }

  // Read post-release escrow state and economics
  const postEscrow = await writeClient.readContract({
    address: manifest.contractAddress,
    functionName: "get_escrow",
    args: [targetCase.escrowId],
  });
  const postEconomics = await writeClient.readContract({
    address: manifest.contractAddress,
    functionName: "get_economics",
    args: [],
  });

  // Validate expected status and match_reason
  if (caseName === "success") {
    if (postEscrow.status !== "RELEASED") {
      throw new Error(`Success settlement mismatch: expected 'RELEASED', received '${postEscrow.status}'.`);
    }
    if (postEscrow.match_reason !== "VERIFIED_RELEASE") {
      throw new Error(`Success match reason mismatch: expected 'VERIFIED_RELEASE', received '${postEscrow.match_reason}'.`);
    }
    if (BigInt(postEscrow.payout ?? 0) !== PRINCIPAL_PER_ESCROW_WEI) {
      throw new Error(`Payout mismatch: expected ${PRINCIPAL_PER_ESCROW_WEI}, received ${postEscrow.payout}.`);
    }
    verifyEconomicsDelta({
      econBefore: preEconomics,
      econAfter: postEconomics,
      expectedType: "PAYOUT",
      amountWei: PRINCIPAL_PER_ESCROW_WEI,
    });
  } else {
    if (postEscrow.status !== "REFUND_NOHIT") {
      throw new Error(`Mismatch settlement mismatch: expected 'REFUND_NOHIT', received '${postEscrow.status}'.`);
    }
    if (!CONCLUSIVE_MISMATCH_REASONS.includes(postEscrow.match_reason)) {
      throw new Error(`Mismatch reason '${postEscrow.match_reason}' is not an acknowledged conclusive refund reason.`);
    }
    if (BigInt(postEscrow.refund ?? 0) !== PRINCIPAL_PER_ESCROW_WEI) {
      throw new Error(`Refund mismatch: expected ${PRINCIPAL_PER_ESCROW_WEI}, received ${postEscrow.refund}.`);
    }
    verifyEconomicsDelta({
      econBefore: preEconomics,
      econAfter: postEconomics,
      expectedType: "REFUND",
      amountWei: PRINCIPAL_PER_ESCROW_WEI,
    });
  }

  // Verify emitted message and child transfer
  let transferProof = { messageEmitted: false, fundsDelivered: false };
  try {
    const expectedTarget = caseName === "success" ? postEscrow.recipient : postEscrow.funder;
    transferProof = await verifyTransferFn({
      client: writeClient,
      txInfo: receipt,
      step: targetCase.release,
      expectedTarget,
      amountWei: PRINCIPAL_PER_ESCROW_WEI,
      isPayout: caseName === "success",
      saveEvidence: () => atomicWriteJson(evidencePath, evidence),
    });
  } catch (err) {
    console.warn(`[⚠️ NOTICE] Transfer verification note: ${err.message}`);
  }

  if (transferProof?.fundsDelivered) {
    targetCase.release.state = "VERIFIED";
  } else if (transferProof?.messageEmitted) {
    targetCase.release.state = "SETTLEMENT_VERIFIED_TRANSFER_PENDING";
  } else {
    targetCase.release.state = "PROOF_INCOMPLETE";
  }

  targetCase.release.executionResult = execResult;
  targetCase.release.resultingStatus = postEscrow.status;
  targetCase.release.resultingMatchReason = postEscrow.match_reason;
  targetCase.release.finalizedAtUtc = new Date().toISOString();
  targetCase.release.transferProof = transferProof;
  targetCase.release.postEconomicsSnapshot = serializeEconomics(postEconomics);
  targetCase.release.postEscrowSnapshot = serializeEscrow(postEscrow);

  targetCase.state = targetCase.release.state;
  targetCase.resultingStatus = postEscrow.status;
  targetCase.resultingMatchReason = postEscrow.match_reason;
  targetCase.transferProof = transferProof;

  atomicWriteJson(evidencePath, evidence);
  console.log(`[✓] Release verified successfully for case '${caseName}' (State: ${targetCase.release.state}, Result: ${postEscrow.status} / ${postEscrow.match_reason})`);

  return {
    success: targetCase.release.state === "VERIFIED",
    txHash,
    status: postEscrow.status,
    matchReason: postEscrow.match_reason,
    state: targetCase.release.state,
    receipt,
  };
}

// CLI Execution Entry Point
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] || "preflight";
  const caseArg = process.argv.find((a) => a.startsWith("--case="))?.split("=")[1];

  switch (mode) {
    case "preflight":
      runPreflight()
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(`[-] Preflight failed: ${err.message}`);
          process.exit(1);
        });
      break;
    case "fund":
      runFund({ caseName: caseArg })
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(`[-] Fund failed: ${err.message}`);
          process.exit(1);
        });
      break;
    case "reconcile":
      runReconcile()
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(`[-] Reconcile failed: ${err.message}`);
          process.exit(1);
        });
      break;
    case "release":
      runRelease({ caseName: caseArg })
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(`[-] Release failed: ${err.message}`);
          process.exit(1);
        });
      break;
    default:
      console.error(`Unknown mode '${mode}'. Available modes: preflight, fund, reconcile, release`);
      process.exit(1);
  }
}
