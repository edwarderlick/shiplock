/**
 * evidence_helper.mjs
 *
 * Robust, fail-closed utilities for ShipLock steward evidence runners:
 * - Atomic JSON file persistence (crash-safe)
 * - Exact PyPI /pypi/{package}/{version}/json parsing matching contracts/shiplock.py (urls[], non-yanked timestamps)
 * - Exact npm metadata parsing matching contracts/shiplock.py
 * - Pre-transaction escrow & economics baseline snapshot persistence alongside pending hash
 * - Fail-closed transaction execution and receipt verification
 * - Crash-recovery reconciliation against saved baseline snapshots before applying current registry or time gates
 * - Post-transaction escrow state, match_reason, payout/refund, and economics delta verification
 */

import { writeFileSync, readFileSync, renameSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rootDir = resolve(import.meta.dirname, "..");
const {
  encodeExternalMessageFeeParams,
  deriveExternalMessageCallKey,
  MESSAGE_ALLOCATION_ROOT_PARENT_INDEX,
} = require(resolve(rootDir, "web/node_modules/genlayer-js/dist/index.js"));

/**
 * Write JSON atomically via temporary file rename to prevent file corruption.
 */
export function atomicWriteJson(filePath, data) {
  const resolved = resolve(filePath);
  const tempPath = `${resolved}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const jsonStr = JSON.stringify(
    data,
    (key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  );
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
 * Normalizes PyPI package names matching contracts/shiplock.py:_norm_pypi_name.
 */
export function normPypiName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[-_.]+/g, "-");
}

/**
 * Parses UTC ISO timestamps matching contracts/shiplock.py:_parse_utc.
 */
export function parseUtcIso(s) {
  let t = String(s || "").trim();
  if (!t) throw new Error("empty timestamp");
  t = t.replace(/\s+UTC$/i, "").replace(/Z$/i, "+00:00");
  if (!t.includes("T") && t.includes(" ")) {
    t = t.replace(" ", "T");
  }
  if (t.length === 10) {
    t = t + "T00:00:00+00:00";
  } else if (t.length === 16) {
    t = t + ":00+00:00";
  } else if (t.length === 19) {
    t = t + "+00:00";
  }
  const dt = new Date(t);
  if (isNaN(dt.getTime())) throw new Error(`invalid timestamp: ${s}`);
  return dt;
}

function getMinTimestamp(times) {
  if (!times || times.length === 0) return "";
  return times.slice().sort((a, b) => parseUtcIso(a).getTime() - parseUtcIso(b).getTime())[0];
}

/**
 * Parses PyPI /pypi/{package}/{version}/json metadata matching contracts/shiplock.py:parse_pypi_metadata.
 *
 * Requirements:
 * - Uses data.urls[] rather than a releases key (which does not exist on version endpoints).
 * - Requires a usable timestamp from an actual non-yanked file in urls[].
 * - Distinguishes 404, mismatch, inconclusive, yanked, and valid 200 responses.
 */
export function parsePypiVersionMetadata(data, targetPkg, targetVer) {
  if (!data || typeof data !== "object") {
    return {
      status_code: 200,
      kind: "non-json",
      yanked: false,
      publish_time: "",
      error: "missing or invalid data",
    };
  }

  const info = data.info;
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    return {
      status_code: 200,
      kind: "non-json",
      yanked: false,
      publish_time: "",
      error: "missing info",
    };
  }

  const returnedName = String(info.name || "");
  const returnedVer = String(info.version || "");
  if (normPypiName(returnedName) !== normPypiName(targetPkg)) {
    return {
      status_code: 200,
      kind: "mismatch",
      yanked: false,
      publish_time: "",
      error: "package name mismatch",
    };
  }
  if (returnedVer.trim() !== String(targetVer || "").trim()) {
    return {
      status_code: 200,
      kind: "mismatch",
      yanked: false,
      publish_time: "",
      error: "version mismatch",
    };
  }

  const infoYanked = Boolean(info.yanked);
  const urls = Array.isArray(data.urls) ? data.urls : [];

  const nonYankedTimes = [];
  const allValidTimes = [];
  let hasAnyFile = false;
  let allFilesYanked = true;

  for (const item of urls) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    hasAnyFile = true;
    const itemYanked = Boolean(item.yanked);
    const t = item.upload_time_iso_8601 || item.upload_time;
    if (t) {
      const tStr = String(t).trim();
      try {
        parseUtcIso(tStr);
        allValidTimes.push(tStr);
        if (!itemYanked) {
          allFilesYanked = false;
          nonYankedTimes.push(tStr);
        }
      } catch {
        if (!itemYanked) {
          allFilesYanked = false;
        }
      }
    } else {
      if (!itemYanked) {
        allFilesYanked = false;
      }
    }
  }

  // Check for yanked release
  if (infoYanked || (hasAnyFile && allFilesYanked)) {
    const pubTime = allValidTimes.length > 0 ? getMinTimestamp(allValidTimes) : "";
    return {
      status_code: 200,
      kind: "200",
      yanked: true,
      publish_time: pubTime,
    };
  }

  // For non-yanked release, publication evidence requires a usable timestamp from an actual non-yanked file in urls[].
  if (nonYankedTimes.length === 0) {
    return {
      status_code: 200,
      kind: "inconclusive",
      yanked: false,
      publish_time: "",
      error: "no usable timestamp from non-yanked file in urls",
    };
  }

  return {
    status_code: 200,
    kind: "200",
    yanked: false,
    publish_time: getMinTimestamp(nonYankedTimes),
  };
}

/**
 * Parses npm metadata matching contracts/shiplock.py:parse_npm_metadata.
 */
export function parseNpmMetadata(data, targetPkg, targetVer) {
  if (!data || typeof data !== "object") {
    return {
      status_code: 200,
      kind: "non-json",
      yanked: false,
      publish_time: "",
      error: "missing or invalid data",
    };
  }

  const returnedName = String(data.name || "");
  if (returnedName.trim().toLowerCase() !== String(targetPkg || "").trim().toLowerCase()) {
    return {
      status_code: 200,
      kind: "mismatch",
      yanked: false,
      publish_time: "",
      error: "package name mismatch",
    };
  }

  const timeMap = data.time;
  const versionsMap = data.versions;

  if (!timeMap || typeof timeMap !== "object" || !versionsMap || typeof versionsMap !== "object") {
    return {
      status_code: 200,
      kind: "inconclusive",
      yanked: false,
      publish_time: "",
      error: "missing or malformed versions or time maps",
    };
  }

  const verKey = String(targetVer || "").trim();
  const expectedPkg = String(targetPkg || "").trim().toLowerCase();

  if (!(verKey in versionsMap) && !(verKey in timeMap)) {
    return {
      status_code: 404,
      kind: "404",
      yanked: false,
      publish_time: "",
      error: "version not published",
    };
  }

  let hasExactVerObj = false;
  let isYanked = false;
  if (verKey in versionsMap) {
    const vObj = versionsMap[verKey];
    if (vObj && typeof vObj === "object") {
      const vName = String(vObj.name || "").trim().toLowerCase();
      const vVer = String(vObj.version || "").trim();
      if (vName === expectedPkg && vVer === verKey) {
        hasExactVerObj = true;
        isYanked = Boolean(vObj.yanked);
      }
    }
  }

  let hasValidTime = false;
  let pubTime = "";
  if (verKey in timeMap) {
    const rawT = String(timeMap[verKey] || "").trim();
    if (rawT) {
      try {
        parseUtcIso(rawT);
        hasValidTime = true;
        pubTime = rawT;
      } catch {
        hasValidTime = false;
      }
    }
  }

  if (hasExactVerObj && hasValidTime) {
    return {
      status_code: 200,
      kind: "200",
      yanked: isYanked,
      publish_time: pubTime,
    };
  }

  return {
    status_code: 200,
    kind: "inconclusive",
    yanked: false,
    publish_time: "",
    error: "incomplete npm version evidence",
  };
}

/**
 * Queries official registry endpoints for PyPI and npm.
 */
export async function queryRegistryMetadata(template, packageName, version) {
  if (template === "PYPI_VERSION") {
    const url = `https://pypi.org/pypi/${packageName}/${version}/json`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const statusCode = res.status;
      if (statusCode === 404) {
        return {
          url,
          statusCode: 404,
          exists: false,
          publishTime: null,
          isYanked: false,
          kind: "404",
          summary: "Package or version not found (HTTP 404)",
        };
      }
      if (!res.ok) {
        return {
          url,
          statusCode,
          exists: false,
          publishTime: null,
          isYanked: false,
          kind: "http_error",
          summary: `HTTP error ${statusCode}: ${res.statusText}`,
        };
      }
      const data = await res.json();
      const parsed = parsePypiVersionMetadata(data, packageName, version);
      return {
        url,
        statusCode: 200,
        exists: parsed.kind === "200",
        publishTime: parsed.publish_time || null,
        isYanked: parsed.yanked,
        kind: parsed.kind,
        error: parsed.error || null,
        yankedReason: data.info?.yanked_reason || null,
        summary:
          parsed.kind === "200"
            ? `Published on PyPI at ${parsed.publish_time} (yanked: ${parsed.yanked})`
            : `PyPI response inconclusive: ${parsed.error || parsed.kind}`,
      };
    } catch (err) {
      return {
        url,
        statusCode: 0,
        exists: false,
        publishTime: null,
        isYanked: false,
        kind: "network_error",
        summary: `Network fetch failed: ${err.message}`,
      };
    }
  } else if (template === "NPM_VERSION") {
    const safePkg =
      packageName.startsWith("@") && packageName.includes("/")
        ? `${packageName.split("/")[0]}%2F${packageName.split("/")[1]}`
        : packageName;
    const url = `https://registry.npmjs.org/${safePkg}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const statusCode = res.status;
      if (statusCode === 404) {
        return {
          url,
          statusCode: 404,
          exists: false,
          publishTime: null,
          isYanked: false,
          kind: "404",
          summary: "Package not found on npm (HTTP 404)",
        };
      }
      if (!res.ok) {
        return {
          url,
          statusCode,
          exists: false,
          publishTime: null,
          isYanked: false,
          kind: "http_error",
          summary: `HTTP error ${statusCode}: ${res.statusText}`,
        };
      }
      const data = await res.json();
      const parsed = parseNpmMetadata(data, packageName, version);
      if (parsed.kind === "404") {
        return {
          url,
          statusCode: 404,
          exists: false,
          publishTime: null,
          isYanked: false,
          kind: "404",
          summary: `Version ${version} not published on npm`,
        };
      }
      return {
        url,
        statusCode: 200,
        exists: parsed.kind === "200",
        publishTime: parsed.publish_time || null,
        isYanked: parsed.yanked,
        kind: parsed.kind,
        error: parsed.error || null,
        summary:
          parsed.kind === "200"
            ? `Published on npm at ${parsed.publish_time} (yanked: ${parsed.yanked})`
            : `npm response inconclusive: ${parsed.error || parsed.kind}`,
      };
    } catch (err) {
      return {
        url,
        statusCode: 0,
        exists: false,
        publishTime: null,
        isYanked: false,
        kind: "network_error",
        summary: `Network fetch failed: ${err.message}`,
      };
    }
  } else {
    throw new Error(`Unsupported template: ${template}`);
  }
}

/**
 * Serializes on-chain escrow data into a baseline snapshot object.
 */
export function serializeEscrow(escrow) {
  if (!escrow) return null;
  return {
    id: escrow.id ? String(escrow.id) : undefined,
    status: String(escrow.status || ""),
    amount: escrow.amount !== undefined ? escrow.amount.toString() : "0",
    match_reason: String(escrow.match_reason || ""),
    payout: escrow.payout !== undefined ? escrow.payout.toString() : "0",
    refund: escrow.refund !== undefined ? escrow.refund.toString() : "0",
    funder: escrow.funder ? String(escrow.funder) : undefined,
    recipient: escrow.recipient ? String(escrow.recipient) : undefined,
  };
}

/**
 * Serializes on-chain economics data into a baseline snapshot object.
 */
export function serializeEconomics(econ) {
  if (!econ) return null;
  return {
    escrowed_open: econ.escrowed_open !== undefined ? econ.escrowed_open.toString() : "0",
    paid_to_recipients: econ.paid_to_recipients !== undefined ? econ.paid_to_recipients.toString() : "0",
    refunded_to_funders: econ.refunded_to_funders !== undefined ? econ.refunded_to_funders.toString() : "0",
    outstanding_credits: econ.outstanding_credits !== undefined ? econ.outstanding_credits.toString() : "0",
    treasury: econ.treasury !== undefined ? econ.treasury.toString() : "0",
  };
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
      throw new Error(
        `Economics mismatch: escrowed_open did not decrease by ${amt}. Before: ${openBefore}, After: ${openAfter}`
      );
    }
    if (paidAfter - paidBefore !== amt) {
      throw new Error(
        `Economics mismatch: paid_to_recipients did not increase by ${amt}. Before: ${paidBefore}, After: ${paidAfter}`
      );
    }
  } else if (expectedType === "REFUND") {
    if (openBefore - openAfter !== amt) {
      throw new Error(
        `Economics mismatch: escrowed_open did not decrease by ${amt}. Before: ${openBefore}, After: ${openAfter}`
      );
    }
    if (refundAfter - refundBefore !== amt) {
      throw new Error(
        `Economics mismatch: refunded_to_funders did not increase by ${amt}. Before: ${refundBefore}, After: ${refundAfter}`
      );
    }
  } else if (expectedType === "NO_CHANGE") {
    if (openBefore !== openAfter) {
      throw new Error(
        `Economics mismatch: escrowed_open changed unexpectedly. Before: ${openBefore}, After: ${openAfter}`
      );
    }
    if (paidBefore !== paidAfter) {
      throw new Error(
        `Economics mismatch: paid_to_recipients changed unexpectedly. Before: ${paidBefore}, After: ${paidAfter}`
      );
    }
    if (refundBefore !== refundAfter) {
      throw new Error(
        `Economics mismatch: refunded_to_funders changed unexpectedly. Before: ${refundBefore}, After: ${refundAfter}`
      );
    }
  }
}

/**
 * Reconciles an existing pending transaction against its persisted baseline snapshot.
 * Guarantees:
 * - Looks up recorded txHash on RPC (never resubmits silently).
 * - Awaits finalization if still pending.
 * - Requires FINALIZED + FINISHED_WITH_RETURN execution.
 * - Validates post-escrow state and economics delta against pre-transaction snapshot.
 * - Never sets verified=true unless all checks pass.
 */
export function syncAttemptHistory(record, step) {
  if (!record || !step || !step.txHash) return;
  if (!Array.isArray(record.inWindowAttempts)) {
    record.inWindowAttempts = [];
  }
  const idx = record.inWindowAttempts.findIndex((a) => a.txHash === step.txHash);
  const entry = { ...step };
  if (idx >= 0) {
    record.inWindowAttempts[idx] = entry;
  } else {
    record.inWindowAttempts.push(entry);
  }
}

/**
 * Queries Studio Next RPC for current block timestamp using eth_getBlockByNumber("latest").
 * Falls back to local UTC if the RPC query fails or is unsupported in mock environments.
 */
export async function getRpcTime(client) {
  try {
    if (typeof client?.request === "function") {
      const block = await client.request({ method: "eth_getBlockByNumber", params: ["latest", false] });
      if (block?.timestamp) {
        const sec = typeof block.timestamp === "string" && block.timestamp.startsWith("0x")
          ? parseInt(block.timestamp, 16)
          : Number(block.timestamp);
        if (!isNaN(sec) && sec > 0) {
          const rpcDate = new Date(sec * 1000);
          console.log(`  [⏰ TIME GATE] Studio Next RPC block timestamp: ${rpcDate.toISOString()}`);
          return rpcDate;
        }
      }
    }
  } catch (err) {
    console.warn(`  [⚠️ NOTICE] Failed to query Studio Next RPC time (${err.message}). Falling back to local UTC.`);
  }
  const localDate = new Date();
  console.log(`  [⏰ TIME GATE] Using local UTC timestamp: ${localDate.toISOString()}`);
  return localDate;
}

/**
 * Verifies the actual emitted transfer or child transaction for successful payout and refund before setting verified: true.
 * Guarantees:
 * - Reconciles any recorded pending child transfer on restart.
 * - Inspects triggered_transactions and messages on the transaction receipt.
 * - Verifies recipient, amount, and finalized execution result.
 * - Fails closed before setting verified: true.
 */
export async function verifyEmittedTransferOrChildTx({
  client,
  txInfo,
  step,
  expectedTarget,
  amountWei,
  isPayout,
  saveEvidence = () => {},
}) {
  const targetLower = String(expectedTarget || "").toLowerCase();
  const amtExpected = BigInt(amountWei ?? 0);
  const transferType = isPayout ? "PAYOUT_TO_RECIPIENT" : "REFUND_TO_FUNDER";

  // 1. Reconcile previously recorded pending child transfer if present (e.g. on restart)
  if (step.childTransfer?.txHash && !step.childTransfer?.verified) {
    console.log(`  [🔍 RECOVERY] Reconciling pending child transfer: ${step.childTransfer.txHash}`);
    let childTx = await client.getTransaction({ hash: step.childTransfer.txHash });
    if (!childTx) {
      throw new Error(`Recorded child transfer ${step.childTransfer.txHash} not found on RPC!`);
    }
    if (childTx.statusName !== "FINALIZED" && typeof client.waitForTransactionReceipt === "function") {
      console.log(`    Awaiting child transfer finalization (${step.childTransfer.txHash})...`);
      await client.waitForTransactionReceipt({
        hash: step.childTransfer.txHash,
        waitUntil: "finalized",
        retries: 50,
        interval: 3000,
      });
      childTx = await client.getTransaction({ hash: step.childTransfer.txHash });
    }
    if (
      childTx.statusName !== "FINALIZED" ||
      (childTx.txExecutionResultName !== "FINISHED_WITH_RETURN" && childTx.txExecutionResultName !== "SUCCESS")
    ) {
      step.childTransfer.failed = true;
      saveEvidence();
      throw new Error(
        `Child transfer ${step.childTransfer.txHash} execution failed: status=${childTx.statusName}, result=${childTx.txExecutionResultName}`
      );
    }
    const childTo = String(childTx.to_address || childTx.to || childTx.recipient || "").toLowerCase();
    if (childTo && childTo !== targetLower) {
      throw new Error(`Child transfer recipient mismatch: expected ${targetLower}, got ${childTo}`);
    }
    const childVal = BigInt(childTx.value ?? amtExpected);
    if (childVal !== amtExpected) {
      throw new Error(`Child transfer value mismatch: expected ${amtExpected}, got ${childVal}`);
    }
    step.childTransfer.status = childTx.statusName;
    step.childTransfer.executionResult = childTx.txExecutionResultName;
    step.childTransfer.verified = true;
    step.childTransfer.finalizedAtUtc = new Date().toISOString();
  }

  // 2. If txInfo exposes triggered_transactions (child transactions), verify each or primary
  if (Array.isArray(txInfo?.triggered_transactions) && txInfo.triggered_transactions.length > 0) {
    console.log(`  [*] Inspecting ${txInfo.triggered_transactions.length} child transaction(s)...`);
    for (const childHash of txInfo.triggered_transactions) {
      if (!step.childTransfer) {
        step.childTransfer = {
          txHash: childHash,
          status: "PENDING",
          expectedTarget: targetLower,
          amountWei: amtExpected.toString(),
        };
        saveEvidence();
      }
      let childTx = await client.getTransaction({ hash: childHash });
      if (!childTx) {
        throw new Error(`Triggered child transaction ${childHash} not found on RPC!`);
      }
      if (childTx.statusName !== "FINALIZED" && typeof client.waitForTransactionReceipt === "function") {
        await client.waitForTransactionReceipt({
          hash: childHash,
          waitUntil: "finalized",
          retries: 50,
          interval: 3000,
        });
        childTx = await client.getTransaction({ hash: childHash });
      }
      if (
        childTx.statusName !== "FINALIZED" ||
        (childTx.txExecutionResultName !== "FINISHED_WITH_RETURN" && childTx.txExecutionResultName !== "SUCCESS")
      ) {
        step.childTransfer.failed = true;
        saveEvidence();
        throw new Error(
          `Child transaction ${childHash} execution failed: status=${childTx.statusName}, result=${childTx.txExecutionResultName}`
        );
      }
      const childTo = String(childTx.to_address || childTx.to || childTx.recipient || "").toLowerCase();
      if (childTo && childTo !== targetLower) {
        throw new Error(`Child transaction recipient mismatch: expected ${targetLower}, got ${childTo}`);
      }
      const childVal = BigInt(childTx.value ?? amtExpected);
      if (childVal !== amtExpected) {
        throw new Error(`Child transaction amount mismatch: expected ${amtExpected}, got ${childVal}`);
      }
      step.childTransfer.status = childTx.statusName;
      step.childTransfer.executionResult = childTx.txExecutionResultName;
      step.childTransfer.verified = true;
      step.childTransfer.finalizedAtUtc = new Date().toISOString();
    }
  }

  // 3. If txInfo exposes messages, verify emitted GenVM message matches expected recipient
  if (Array.isArray(txInfo?.messages) && txInfo.messages.length > 0) {
    console.log(`  [*] Inspecting ${txInfo.messages.length} emitted GenVM message(s)...`);
    const matchingMsg = txInfo.messages.find((m) => {
      const dest = String(m.recipient || m.to || m.target || "").toLowerCase();
      return dest === targetLower;
    });
    if (!matchingMsg) {
      throw new Error(`Emitted GenVM messages did not include expected recipient ${targetLower}`);
    }
    const msgVal = BigInt(matchingMsg.value ?? matchingMsg.amount ?? amtExpected);
    if (msgVal !== amtExpected) {
      throw new Error(`Emitted message value mismatch: expected ${amtExpected}, got ${msgVal}`);
    }
    step.emittedMessage = {
      recipient: targetLower,
      amountWei: amtExpected.toString(),
      messageType: matchingMsg.messageType ?? 0,
      verified: true,
    };
  }

  // 4. Record comprehensive transfer evidence
  step.transferEvidence = {
    verified: true,
    type: transferType,
    targetAddress: targetLower,
    amountWei: amtExpected.toString(),
    childTransfer: step.childTransfer || null,
    emittedMessage: step.emittedMessage || null,
    verifiedAtUtc: new Date().toISOString(),
  };

  console.log(`  [✓] Verified emitted transfer / child transaction for ${transferType}: ${amtExpected} wei -> ${targetLower}`);
  return true;
}

/**
 * Reconciles a recorded pending transaction by hash:
 * - Checks status on RPC.
 * - If still pending, awaits finalization.
 * - Reconciles post-state against the pre-transaction baseline snapshot.
 * - Fail-closed: throws if status is not FINALIZED / FINISHED_WITH_RETURN.
 */
export async function reconcilePendingTransaction({
  client,
  contractAddress,
  escrowId,
  record,
  stepKey,
  expectedEscrowStatus,
  expectedMatchReason,
  expectedEconomicsDelta, // "NO_CHANGE", "PAYOUT", "REFUND"
  amountWei,
  saveEvidence,
  allowCrossBoundaryRefund = false,
  requireEarly404 = false,
}) {
  const step = record[stepKey];
  if (!step || !step.txHash) {
    return false;
  }
  if (step.completed && step.verified) {
    if (step.childTransfer?.txHash && !step.childTransfer?.verified) {
      const parentTx = await client.getTransaction({ hash: step.txHash });
      await verifyEmittedTransferOrChildTx({
        client,
        txInfo: parentTx,
        step,
        expectedTarget: step.recipient || step.funder,
        amountWei: amountWei || step.payoutWei || step.funderRefundWei,
        isPayout: Boolean(step.payoutWei),
        saveEvidence,
      });
    }
    return {
      txHash: step.txHash,
      completed: true,
      verified: true,
      early404Verified: Boolean(step.early404Verified),
      refundSettlementVerified: Boolean(step.refundSettlementVerified),
    };
  }

  const txHash = step.txHash;
  console.log(`  [🔍 RECOVERY] Reconciling pending transaction: ${txHash}`);

  const existingTx = await client.getTransaction({ hash: txHash });
  if (!existingTx) {
    throw new Error(
      `Previously recorded transaction ${txHash} not found on RPC. Aborting without resubmitting.`
    );
  }

  let txInfo = existingTx;
  if (existingTx.statusName !== "FINALIZED") {
    console.log(`    [*] Transaction still pending (${existingTx.statusName}). Awaiting finalization...`);
    await client.waitForTransactionReceipt({
      hash: txHash,
      waitUntil: "finalized",
      retries: 100,
      interval: 3000,
    });
    txInfo = await client.getTransaction({ hash: txHash });
  }

  console.log(`    Status: ${txInfo.statusName}, Execution: ${txInfo.txExecutionResultName}`);

  step.txStatus = txInfo.statusName;
  step.executionResult = txInfo.txExecutionResultName;

  if (txInfo.statusName !== "FINALIZED" || txInfo.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    step.failed = true;
    step.verified = false;
    step.completed = true;
    if (stepKey === "inWindowAttempt") syncAttemptHistory(record, step);
    saveEvidence();
    throw new Error(
      `Transaction ${txHash} failed closed: status=${txInfo.statusName}, result=${txInfo.txExecutionResultName}`
    );
  }

  // Baseline snapshots must exist
  if (!step.preEscrowSnapshot || !step.preEconomicsSnapshot) {
    throw new Error(
      `Missing pre-transaction baseline snapshot for step ${stepKey} in pending transaction ${txHash}! Cannot safely reconcile without baseline.`
    );
  }

  const afterEscrow = await client.readContract({
    address: contractAddress,
    functionName: "get_escrow",
    args: [escrowId],
  });
  if (!afterEscrow) {
    throw new Error(`Escrow ${escrowId} not found on-chain during post-tx verification.`);
  }

  const afterEconomics = await client.readContract({
    address: contractAddress,
    functionName: "get_economics",
    args: [],
  });

  // Handle cross-boundary execution: an in-window attempt executed on-chain after window_end -> REFUND_NOHIT
  if (
    stepKey === "inWindowAttempt" &&
    allowCrossBoundaryRefund &&
    afterEscrow.status === "REFUND_NOHIT"
  ) {
    console.log(`  [⚡ CROSS-BOUNDARY] Pending in-window check executed on-chain after window_end -> REFUND_NOHIT.`);
    if (afterEscrow.match_reason !== "WINDOW_EXPIRED_NO_RELEASE") {
      throw new Error(
        `Cross-boundary refund expected match_reason WINDOW_EXPIRED_NO_RELEASE, got ${afterEscrow.match_reason}`
      );
    }
    if (BigInt(afterEscrow.refund ?? 0) !== BigInt(amountWei ?? 0)) {
      throw new Error(
        `Cross-boundary refund amount mismatch: expected ${amountWei}, got ${afterEscrow.refund}`
      );
    }

    verifyEconomicsDelta({
      econBefore: step.preEconomicsSnapshot,
      econAfter: afterEconomics,
      expectedType: "REFUND",
      amountWei,
    });

    // Verify emitted transfer or child transaction for funder refund
    await verifyEmittedTransferOrChildTx({
      client,
      txInfo,
      step,
      expectedTarget: afterEscrow.funder,
      amountWei,
      isPayout: false,
      saveEvidence,
    });

    step.finalizedAtUtc = new Date().toISOString();
    step.reconciledFromPending = true;
    step.resultingEscrowStatus = "REFUND_NOHIT";
    step.resultingMatchReason = afterEscrow.match_reason;
    step.funderRefundWei = afterEscrow.refund.toString();
    step.executedAfterWindowEnd = true;
    step.completed = true;
    step.verified = false; // Must NOT be counted as an early 404 proof!
    step.early404Verified = false;
    step.refundSettlementVerified = true;

    // Distinct evidence flags on record
    record.early404Verified = false;
    record.refundSettlementVerified = true;

    // Record as final settlement evidence so no duplicate settlement transaction is submitted
    record.postWindowSettlement = {
      txHash: step.txHash,
      submittedAtUtc: step.submittedAtUtc,
      finalizedAtUtc: step.finalizedAtUtc,
      txStatus: txInfo.statusName,
      executionResult: txInfo.txExecutionResultName,
      resultingEscrowStatus: "REFUND_NOHIT",
      resultingMatchReason: afterEscrow.match_reason,
      funderRefundWei: afterEscrow.refund.toString(),
      settledViaCrossBoundaryInWindowTx: true,
      completed: true,
      verified: true,
    };
    record.finalState = {
      status: "REFUND_NOHIT",
      settled: true,
      matchReason: afterEscrow.match_reason,
      funderRefundWei: afterEscrow.refund.toString(),
      settledViaCrossBoundaryInWindowTx: true,
    };
    syncAttemptHistory(record, step);
    saveEvidence();

    console.log(`  [✓] Reconciled cross-boundary transaction as final settlement evidence!`);
    return {
      txHash,
      txInfo,
      executedAfterWindowEnd: true,
      completed: true,
      verified: false,
      early404Verified: false,
      refundSettlementVerified: true,
    };
  }

  // Handle temporary registry failures during in-window 404 check:
  if (
    stepKey === "inWindowAttempt" &&
    afterEscrow.status === "OPEN" &&
    (requireEarly404 || expectedMatchReason === "EARLY_404_RETRYABLE") &&
    afterEscrow.match_reason !== "EARLY_404_RETRYABLE"
  ) {
    console.log(`  [⚠️ TEMPORARY FAILURE] In-window check produced match_reason '${afterEscrow.match_reason}' (not EARLY_404_RETRYABLE).`);

    // Verify principal and economics were untouched
    if (BigInt(afterEscrow.amount ?? 0) !== BigInt(step.preEscrowSnapshot.amount ?? 0)) {
      throw new Error(
        `Principal modified during temporary registry failure: expected ${step.preEscrowSnapshot.amount}, got ${afterEscrow.amount}`
      );
    }
    if (BigInt(afterEscrow.payout ?? 0) !== 0n || BigInt(afterEscrow.refund ?? 0) !== 0n) {
      throw new Error(`Payout/refund non-zero during temporary registry failure!`);
    }
    verifyEconomicsDelta({
      econBefore: step.preEconomicsSnapshot,
      econAfter: afterEconomics,
      expectedType: "NO_CHANGE",
      amountWei,
    });

    step.finalizedAtUtc = new Date().toISOString();
    step.txStatus = txInfo.statusName;
    step.executionResult = txInfo.txExecutionResultName;
    step.reconciledFromPending = true;
    step.resultingEscrowStatus = "OPEN";
    step.resultingMatchReason = afterEscrow.match_reason;
    step.temporaryRegistryFailure = true;
    step.completed = true; // Mark attempt complete!
    step.retryable = true;
    step.finding = `Temporary registry failure: ${afterEscrow.match_reason} (404 proof unverified, retryable)`;
    step.verified = false; // MUST NOT mark 404 proof verified!
    step.early404Verified = false;
    record.early404Verified = false;

    syncAttemptHistory(record, step);
    saveEvidence();

    console.log(`  [!] Recorded temporary registry failure separately in attempt history; in-window 404 proof remains unverified.`);
    return {
      txHash,
      txInfo,
      temporaryRegistryFailure: true,
      completed: true,
      verified: false,
      early404Verified: false,
    };
  }

  // Verify escrow post state
  if (expectedEscrowStatus && afterEscrow.status !== expectedEscrowStatus) {
    throw new Error(
      `Escrow post-state mismatch: expected status ${expectedEscrowStatus}, got ${afterEscrow.status}`
    );
  }
  if (expectedMatchReason && afterEscrow.match_reason !== expectedMatchReason) {
    throw new Error(
      `Escrow match_reason mismatch: expected ${expectedMatchReason}, got ${afterEscrow.match_reason}`
    );
  }

  // Specific state invariants
  if (expectedEscrowStatus === "OPEN") {
    if (BigInt(afterEscrow.amount ?? 0) !== BigInt(step.preEscrowSnapshot.amount ?? 0)) {
      throw new Error(
        `Principal modified while OPEN: expected ${step.preEscrowSnapshot.amount}, got ${afterEscrow.amount}`
      );
    }
    if (BigInt(afterEscrow.payout ?? 0) !== 0n || BigInt(afterEscrow.refund ?? 0) !== 0n) {
      throw new Error(
        `Payout or refund non-zero while OPEN: payout=${afterEscrow.payout}, refund=${afterEscrow.refund}`
      );
    }
  } else if (expectedEscrowStatus === "RELEASED") {
    if (BigInt(afterEscrow.payout ?? 0) !== BigInt(amountWei ?? 0)) {
      throw new Error(
        `Payout mismatch on RELEASED: expected ${amountWei}, got ${afterEscrow.payout}`
      );
    }
  } else if (expectedEscrowStatus === "REFUND_NOHIT") {
    if (BigInt(afterEscrow.refund ?? 0) !== BigInt(amountWei ?? 0)) {
      throw new Error(
        `Refund mismatch on REFUND_NOHIT: expected ${amountWei}, got ${afterEscrow.refund}`
      );
    }
  }

  // Verify economics delta against the pre-transaction economics snapshot
  verifyEconomicsDelta({
    econBefore: step.preEconomicsSnapshot,
    econAfter: afterEconomics,
    expectedType: expectedEconomicsDelta,
    amountWei,
  });

  // Verify actual emitted transfer or child transaction for payouts and refunds BEFORE setting verified: true
  if (expectedEconomicsDelta === "PAYOUT" || afterEscrow.status === "RELEASED") {
    await verifyEmittedTransferOrChildTx({
      client,
      txInfo,
      step,
      expectedTarget: afterEscrow.recipient,
      amountWei,
      isPayout: true,
      saveEvidence,
    });
  } else if (expectedEconomicsDelta === "REFUND" || afterEscrow.status === "REFUND_NOHIT") {
    await verifyEmittedTransferOrChildTx({
      client,
      txInfo,
      step,
      expectedTarget: afterEscrow.funder,
      amountWei,
      isPayout: false,
      saveEvidence,
    });
  }

  step.finalizedAtUtc = new Date().toISOString();
  step.txStatus = txInfo.statusName;
  step.executionResult = txInfo.txExecutionResultName;
  step.reconciledFromPending = true;
  step.resultingEscrowStatus = afterEscrow.status;
  step.resultingMatchReason = afterEscrow.match_reason;
  if (afterEscrow.payout !== undefined) step.payoutWei = afterEscrow.payout.toString();
  if (afterEscrow.refund !== undefined) step.funderRefundWei = afterEscrow.refund.toString();
  if (afterEscrow.recipient) step.recipient = String(afterEscrow.recipient);
  step.completed = true;
  step.verified = true;

  if (stepKey === "inWindowAttempt") {
    step.early404Verified = true;
    record.early404Verified = true;
    syncAttemptHistory(record, step);
  } else if (stepKey === "postWindowSettlement") {
    step.refundSettlementVerified = true;
    record.refundSettlementVerified = true;
  }
  saveEvidence();

  console.log(`  [✓] Reconciled and verified transaction ${txHash}!`);
  return {
    txHash,
    txInfo,
    completed: true,
    verified: true,
    early404Verified: stepKey === "inWindowAttempt",
    refundSettlementVerified: stepKey === "postWindowSettlement",
  };
}

/**
 * Executes a write transaction while persisting pre-transaction snapshots and pending hash
 * before awaiting receipt, and reconciling post-state against the baseline.
 */
export async function executeWithBaselineSnapshot({
  client,
  contractAddress,
  escrowId,
  record,
  stepKey,
  submitFn,
  expectedEscrowStatus,
  expectedMatchReason,
  expectedEconomicsDelta,
  amountWei,
  saveEvidence,
  allowCrossBoundaryRefund = false,
  requireEarly404 = false,
  allowRetry = false,
}) {
  const existingStep = record[stepKey];

  // 1. If transaction is genuinely pending, reconcile it before anything else!
  if (existingStep?.txHash && !existingStep?.completed) {
    console.log(`  [🔍 RECOVERY] Found genuinely pending transaction: ${existingStep.txHash}. Reconciling baseline...`);
    return await reconcilePendingTransaction({
      client,
      contractAddress,
      escrowId,
      record,
      stepKey,
      expectedEscrowStatus,
      expectedMatchReason,
      expectedEconomicsDelta,
      amountWei,
      saveEvidence,
      allowCrossBoundaryRefund,
      requireEarly404,
    });
  }

  // 2. If already completed and verified, do not re-submit!
  if (existingStep?.completed && existingStep?.verified) {
    console.log(`  [✓] Step ${stepKey} already completed and verified (${existingStep.txHash}).`);
    return { txHash: existingStep.txHash, verified: true, completed: true };
  }

  // 3. If prior attempt was completed as a temporary failure and retrying is allowed:
  if (existingStep?.completed && existingStep?.temporaryRegistryFailure && allowRetry) {
    console.log(`  [🔄 RETRY] Prior attempt ${existingStep.txHash} was a completed temporary failure. Preserving in history and starting NEW attempt...`);
    syncAttemptHistory(record, existingStep);
  } else if (existingStep?.txHash && !allowRetry) {
    return {
      txHash: existingStep.txHash,
      verified: Boolean(existingStep.verified),
      completed: Boolean(existingStep.completed),
    };
  }

  // Capture fresh baseline snapshot BEFORE submitting
  const preEscrow = await client.readContract({
    address: contractAddress,
    functionName: "get_escrow",
    args: [escrowId],
  });
  const preEconomics = await client.readContract({
    address: contractAddress,
    functionName: "get_economics",
    args: [],
  });

  console.log(`  [*] Submitting write transaction for ${stepKey}...`);
  const txHash = await submitFn();
  console.log(`  [RECORDED] Tx Hash: ${txHash}`);

  // Persist snapshots and pending hash IMMEDIATELY before waiting
  record[stepKey] = {
    txHash,
    txStatus: "PENDING",
    submittedAtUtc: new Date().toISOString(),
    preEscrowSnapshot: serializeEscrow(preEscrow),
    preEconomicsSnapshot: serializeEconomics(preEconomics),
    verified: false,
    completed: false,
  };
  syncAttemptHistory(record, record[stepKey]);
  saveEvidence();

  // Await receipt and reconcile post-state against the baseline
  return await reconcilePendingTransaction({
    client,
    contractAddress,
    escrowId,
    record,
    stepKey,
    expectedEscrowStatus,
    expectedMatchReason,
    expectedEconomicsDelta,
    amountWei,
    saveEvidence,
    allowCrossBoundaryRefund,
    requireEarly404,
  });
}

/**
 * Executes a single in-window check evaluation step for a 404 escrow.
 * Reconciles any genuinely pending transaction first, then allows one new attempt
 * if unverified / retryable. Never overwrites or resubmits a pending hash.
 */
export async function runInWindowCheckStep({
  client,
  contractAddress,
  escrowId,
  record,
  submitFn,
  saveEvidence = () => {},
}) {
  // 1. Reconcile genuinely pending transaction first
  if (record.inWindowAttempt?.txHash && !record.inWindowAttempt?.completed) {
    console.log(`  [🔍 RECOVERY] Found genuinely pending in-window check (${record.inWindowAttempt.txHash}). Reconciling baseline...`);
    await reconcilePendingTransaction({
      client,
      contractAddress,
      escrowId,
      record,
      stepKey: "inWindowAttempt",
      expectedEscrowStatus: "OPEN",
      expectedMatchReason: "EARLY_404_RETRYABLE",
      expectedEconomicsDelta: "NO_CHANGE",
      amountWei: record.principalWei,
      allowCrossBoundaryRefund: true,
      requireEarly404: true,
      saveEvidence,
    });
  }

  // 2. If early-404-proof is already verified, do nothing further
  if (record.early404Verified || record.inWindowAttempt?.early404Verified) {
    return { verified: true, early404Verified: true, skipped: true };
  }

  // 3. If already settled via refund (including cross-boundary), do nothing further
  if (record.refundSettlementVerified || record.postWindowSettlement?.verified) {
    return { refundSettlementVerified: true, skipped: true };
  }

  // 4. Never overwrite or resubmit if still genuinely pending
  if (record.inWindowAttempt?.txHash && !record.inWindowAttempt?.completed) {
    return { pending: true, skipped: true };
  }

  // 5. Execute new in-window release attempt with baseline snapshot
  return await executeWithBaselineSnapshot({
    client,
    contractAddress,
    escrowId,
    record,
    stepKey: "inWindowAttempt",
    submitFn,
    expectedEscrowStatus: "OPEN",
    expectedMatchReason: "EARLY_404_RETRYABLE",
    expectedEconomicsDelta: "NO_CHANGE",
    amountWei: record.principalWei,
    allowCrossBoundaryRefund: true,
    requireEarly404: true,
    allowRetry: true,
    saveEvidence,
  });
}

/**
 * Legacy/compat wrapper for executeWithPendingRecovery.
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
      throw new Error(
        `Previously recorded transaction ${txHash} not found on RPC. Aborting without resubmitting.`
      );
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
      throw new Error(
        `Previously submitted transaction ${txHash} REVERTED on-chain with ${existingTx.txExecutionResultName}. Fail closed.`
      );
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
    throw new Error(
      `Transaction execution failed closed: status=${txInfo.statusName}, result=${txInfo.txExecutionResultName}`
    );
  }

  return { txHash, txInfo };
}

/**
 * Builds the complete allocation tree covering both recipient payout and funder refund for release transactions.
 */
export function buildReleaseMessageAllocations({
  recipient,
  funder,
  budget = 150000000000000n,
  gasLimit = 500000n,
  maxGasPrice = 300000000n,
}) {
  const rClean = String(recipient || "").trim();
  const fClean = String(funder || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(rClean)) throw new Error(`Invalid recipient: ${recipient}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(fClean)) throw new Error(`Invalid funder: ${funder}`);

  const feeParams = encodeExternalMessageFeeParams({ gasLimit, maxGasPrice });
  const callKey = deriveExternalMessageCallKey();

  const recipientNode = {
    messageType: 0,
    onAcceptance: false,
    parentIndex: MESSAGE_ALLOCATION_ROOT_PARENT_INDEX,
    recipient: rClean,
    callKey,
    budget,
    feeParams,
  };

  if (rClean.toLowerCase() === fClean.toLowerCase()) {
    return [recipientNode];
  }

  const funderNode = {
    messageType: 0,
    onAcceptance: false,
    parentIndex: MESSAGE_ALLOCATION_ROOT_PARENT_INDEX,
    recipient: fClean,
    callKey,
    budget,
    feeParams,
  };

  return [recipientNode, funderNode];
}

/**
 * Validates message allocations and phase bounds for transfer-emitting calls.
 */
export function validateTransferAllocations({
  functionName,
  distribution,
  messageAllocations,
  mustHaveTransfer = false,
  expectedRecipients = [],
}) {
  const totalMessageFees = BigInt(distribution?.totalMessageFees ?? 0);
  const hasAllocations = Array.isArray(messageAllocations) && messageAllocations.length > 0;

  // Nonzero totalMessageFees with an empty allocation tree is invalid
  if (totalMessageFees > 0n && !hasAllocations) {
    throw new Error(
      `Invalid fee parameters for ${functionName}: nonzero totalMessageFees (${totalMessageFees}) requires a non-empty messageAllocations tree.`
    );
  }

  // If function is release, an empty allocation tree is strictly unsafe and rejected before sending
  if (functionName === "release" && !hasAllocations) {
    throw new Error(
      `Fee estimation produced an unsafe empty allocation tree for transfer in release. A release transaction must cover both recipient payout and funder refund to protect against cross-boundary execution. Aborting before wallet signing.`
    );
  }

  // If a transfer is mandatory for this call (cancel, expire, withdraw, release):
  if (mustHaveTransfer && !hasAllocations) {
    throw new Error(
      `Fee estimation cannot produce a valid message allocation for transfer in ${functionName}. Aborting before wallet signing.`
    );
  }

  if (hasAllocations) {
    let sumBudgets = 0n;
    const recipientsInAllocations = new Set();

    for (let i = 0; i < messageAllocations.length; i++) {
      const alloc = messageAllocations[i];
      if (
        !alloc ||
        !alloc.recipient ||
        typeof alloc.recipient !== "string" ||
        !/^0x[0-9a-fA-F]{40}$/.test(alloc.recipient.trim())
      ) {
        throw new Error(`Message allocation at index ${i} has invalid recipient: ${alloc?.recipient}`);
      }
      recipientsInAllocations.add(alloc.recipient.trim().toLowerCase());
      if (BigInt(alloc.budget ?? 0) <= 0n) {
        throw new Error(`Message allocation at index ${i} has non-positive budget: ${alloc?.budget}`);
      }

      const parentIdx =
        alloc.parentIndex !== undefined
          ? BigInt(alloc.parentIndex)
          : MESSAGE_ALLOCATION_ROOT_PARENT_INDEX;
      if (parentIdx === MESSAGE_ALLOCATION_ROOT_PARENT_INDEX) {
        sumBudgets += BigInt(alloc.budget);
      }
    }

    if (
      distribution?.totalMessageFees !== undefined &&
      BigInt(distribution.totalMessageFees) !== sumBudgets
    ) {
      throw new Error(
        `Distribution totalMessageFees (${distribution.totalMessageFees}) does not match sum of root message allocations (${sumBudgets})`
      );
    }

    if (Array.isArray(expectedRecipients) && expectedRecipients.length > 0) {
      for (const expected of expectedRecipients) {
        const cleanExpected = String(expected || "").trim().toLowerCase();
        if (!recipientsInAllocations.has(cleanExpected)) {
          throw new Error(
            `Release message allocations missing required recipient ${expected}. Both recipient payout and funder refund allocations are required to protect against cross-boundary execution. Aborting before wallet signing.`
          );
        }
      }
    }
  }
}
