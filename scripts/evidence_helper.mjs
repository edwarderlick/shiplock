/**
 * evidence_helper.mjs
 *
 * Robust, fail-closed utilities for ShipLock steward evidence runners:
 * - Atomic JSON file persistence (crash-safe)
 * - Immediate txHash persistence before waiting
 * - Pending transaction reconciliation upon rerun
 * - Fail-closed transaction execution and receipt verification
 * - Live registry endpoint querying (PyPI & npm)
 * - On-chain post-state & economics delta verification
 */

import { writeFileSync, readFileSync, renameSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

/**
 * Write JSON atomically via temporary file rename to prevent file corruption.
 */
export function atomicWriteJson(filePath, data) {
  const resolved = resolve(filePath);
  const tempPath = `${resolved}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const jsonStr = JSON.stringify(data, (key, value) => {
    return typeof value === "bigint" ? value.toString() : value;
  }, 2);
  writeFileSync(tempPath, jsonStr, "utf-8");
  renameSync(tempPath, resolved);
}

/**
 * Safely read JSON from file, returning null if file does not exist.
 */
export function readJsonSafe(filePath) {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) return null;
  try {
    return JSON.parse(readFileSync(resolved, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse JSON file at ${resolved}: ${err.message}`);
  }
}

/**
 * Queries official registry endpoints for PyPI and npm.
 */
export async function queryRegistryMetadata(template, packageName, version) {
  if (template === "PYPI_VERSION") {
    const url = `https://pypi.org/pypi/${packageName}/${version}/json`;
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const statusCode = res.status;
      if (statusCode === 404) {
        return {
          url,
          statusCode: 404,
          exists: false,
          publishTime: null,
          isYanked: false,
          summary: "Package or version not found (HTTP 404)"
        };
      }
      if (!res.ok) {
        return {
          url,
          statusCode,
          exists: false,
          publishTime: null,
          isYanked: false,
          summary: `HTTP error ${statusCode}: ${res.statusText}`
        };
      }
      const data = await res.json();
      const releases = data.releases || {};
      const versionReleases = releases[version] || [];
      if (versionReleases.length === 0) {
        return {
          url,
          statusCode: 200,
          exists: false,
          publishTime: null,
          isYanked: false,
          summary: "Version releases array empty in PyPI response"
        };
      }
      const first = versionReleases[0];
      const pubTime = first.upload_time_iso_8601 || first.upload_time || null;
      const isYanked = Boolean(first.yanked || data.info?.yanked);
      return {
        url,
        statusCode: 200,
        exists: true,
        publishTime: pubTime,
        isYanked,
        yankedReason: first.yanked_reason || data.info?.yanked_reason || null,
        summary: `Published on PyPI at ${pubTime} (yanked: ${isYanked})`
      };
    } catch (err) {
      return {
        url,
        statusCode: 0,
        exists: false,
        publishTime: null,
        isYanked: false,
        summary: `Network fetch failed: ${err.message}`
      };
    }
  } else if (template === "NPM_VERSION") {
    const url = `https://registry.npmjs.org/${packageName}`;
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const statusCode = res.status;
      if (statusCode === 404) {
        return {
          url,
          statusCode: 404,
          exists: false,
          publishTime: null,
          isYanked: false,
          summary: "Package not found on npm (HTTP 404)"
        };
      }
      if (!res.ok) {
        return {
          url,
          statusCode,
          exists: false,
          publishTime: null,
          isYanked: false,
          summary: `HTTP error ${statusCode}: ${res.statusText}`
        };
      }
      const data = await res.json();
      const timeObj = data.time || {};
      const pubTime = timeObj[version] || null;
      const versionsObj = data.versions || {};
      const versionObj = versionsObj[version];
      if (!pubTime || !versionObj) {
        return {
          url,
          statusCode: 200,
          exists: false,
          publishTime: null,
          isYanked: false,
          summary: `Package exists on npm but version ${version} not found in time/versions map`
        };
      }
      return {
        url,
        statusCode: 200,
        exists: true,
        publishTime: pubTime,
        isYanked: false,
        summary: `Published on npm at ${pubTime}`
      };
    } catch (err) {
      return {
        url,
        statusCode: 0,
        exists: false,
        publishTime: null,
        isYanked: false,
        summary: `Network fetch failed: ${err.message}`
      };
    }
  } else {
    throw new Error(`Unsupported template: ${template}`);
  }
}

/**
 * Reconciles an existing pending transaction or submits a new transaction.
 * Enforces:
 * - Immediate hash persistence before waiting
 * - Pending transaction lookup upon rerun
 * - Rejection of unconfirmed or reverted transactions
 * - Finalized receipt confirmation
 */
export async function executeWithPendingRecovery({
  client,
  record,
  stepKey,
  saveEvidence,
  submitFn,
}) {
  let txHash = record[stepKey]?.txHash;

  if (txHash) {
    console.log(`  [🔍 RECOVERY] Found previously recorded txHash: ${txHash}`);
    const existingTx = await client.getTransaction({ hash: txHash });
    if (!existingTx) {
      throw new Error(`Previously recorded transaction ${txHash} not found on RPC. Aborting without resubmitting.`);
    }

    console.log(`    Status: ${existingTx.statusName}, Execution: ${existingTx.txExecutionResultName}`);
    if (existingTx.statusName === "FINALIZED" && existingTx.txExecutionResultName === "FINISHED_WITH_RETURN") {
      console.log(`    [✓] Transaction previously finalized with SUCCESS.`);
      record[stepKey].txStatus = existingTx.statusName;
      record[stepKey].executionResult = existingTx.txExecutionResultName;
      record[stepKey].reconciledFromPending = true;
      saveEvidence();
      return { txHash, txInfo: existingTx };
    }

    if (existingTx.statusName === "FINALIZED" && existingTx.txExecutionResultName !== "FINISHED_WITH_RETURN") {
      record[stepKey].txStatus = existingTx.statusName;
      record[stepKey].executionResult = existingTx.txExecutionResultName;
      record[stepKey].failed = true;
      saveEvidence();
      throw new Error(`Previously submitted transaction ${txHash} REVERTED on-chain with ${existingTx.txExecutionResultName}. Fail closed.`);
    }

    console.log(`    [*] Transaction is still pending on-chain. Waiting for finalization...`);
  } else {
    console.log(`  [*] Submitting new write transaction...`);
    txHash = await submitFn();
    console.log(`  [RECORDED] Tx Hash: ${txHash}`);

    // Persist hash IMMEDIATELY before waiting
    if (!record[stepKey]) record[stepKey] = {};
    record[stepKey].txHash = txHash;
    record[stepKey].submittedAtUtc = new Date().toISOString();
    record[stepKey].txStatus = "PENDING";
    saveEvidence();
  }

  // Wait for finalization
  console.log(`  [*] Waiting for finalization of ${txHash}...`);
  await client.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
    retries: 100,
    interval: 3000,
  });

  const txInfo = await client.getTransaction({ hash: txHash });
  console.log(`  [✓] Finalized! Status: ${txInfo.statusName}, Execution: ${txInfo.txExecutionResultName}`);

  record[stepKey].txStatus = txInfo.statusName;
  record[stepKey].executionResult = txInfo.txExecutionResultName;
  record[stepKey].finalizedAtUtc = new Date().toISOString();
  saveEvidence();

  if (txInfo.statusName !== "FINALIZED" || txInfo.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    record[stepKey].failed = true;
    saveEvidence();
    throw new Error(`Transaction execution failed closed: status=${txInfo.statusName}, result=${txInfo.txExecutionResultName}`);
  }

  return { txHash, txInfo };
}

/**
 * Validates post-transaction economics deltas.
 */
export function verifyEconomicsDelta({
  econBefore,
  econAfter,
  expectedType, // "PAYOUT", "REFUND", "NO_CHANGE"
  amountWei,
}) {
  const amt = BigInt(amountWei);
  const openBefore = BigInt(econBefore.escrowed_open);
  const openAfter = BigInt(econAfter.escrowed_open);
  const paidBefore = BigInt(econBefore.paid_to_recipients);
  const paidAfter = BigInt(econAfter.paid_to_recipients);
  const refundBefore = BigInt(econBefore.refunded_to_funders);
  const refundAfter = BigInt(econAfter.refunded_to_funders);

  if (expectedType === "PAYOUT") {
    if (openBefore - openAfter !== amt) {
      throw new Error(`Economics mismatch: escrowed_open did not decrease by ${amt}. Before: ${openBefore}, After: ${openAfter}`);
    }
    if (paidAfter - paidBefore !== amt) {
      throw new Error(`Economics mismatch: paid_to_recipients did not increase by ${amt}. Before: ${paidBefore}, After: ${paidAfter}`);
    }
  } else if (expectedType === "REFUND") {
    if (openBefore - openAfter !== amt) {
      throw new Error(`Economics mismatch: escrowed_open did not decrease by ${amt}. Before: ${openBefore}, After: ${openAfter}`);
    }
    if (refundAfter - refundBefore !== amt) {
      throw new Error(`Economics mismatch: refunded_to_funders did not increase by ${amt}. Before: ${refundBefore}, After: ${refundAfter}`);
    }
  } else if (expectedType === "NO_CHANGE") {
    if (openBefore !== openAfter) {
      throw new Error(`Economics mismatch: escrowed_open changed unexpectedly. Before: ${openBefore}, After: ${openAfter}`);
    }
    if (paidBefore !== paidAfter) {
      throw new Error(`Economics mismatch: paid_to_recipients changed unexpectedly. Before: ${paidBefore}, After: ${paidAfter}`);
    }
    if (refundBefore !== refundAfter) {
      throw new Error(`Economics mismatch: refunded_to_funders changed unexpectedly. Before: ${refundBefore}, After: ${refundAfter}`);
    }
  }
}
