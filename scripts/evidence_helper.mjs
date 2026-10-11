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
}) {
  const step = record[stepKey];
  if (!step || !step.txHash) {
    return false;
  }
  if (step.verified) {
    return true;
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

  step.finalizedAtUtc = new Date().toISOString();
  step.reconciledFromPending = true;
  step.resultingEscrowStatus = afterEscrow.status;
  step.resultingMatchReason = afterEscrow.match_reason;
  if (afterEscrow.payout !== undefined) step.payoutWei = afterEscrow.payout.toString();
  if (afterEscrow.refund !== undefined) step.funderRefundWei = afterEscrow.refund.toString();
  if (afterEscrow.recipient) step.recipient = String(afterEscrow.recipient);
  step.verified = true;
  saveEvidence();

  console.log(`  [✓] Reconciled and verified transaction ${txHash}!`);
  return { txHash, txInfo };
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
}) {
  // If transaction was already submitted and pending or finalized, reconcile it directly!
  if (record[stepKey]?.txHash) {
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
    });
  }

  // Capture baseline BEFORE submitting
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
    ...(record[stepKey] || {}),
    txHash,
    txStatus: "PENDING",
    submittedAtUtc: new Date().toISOString(),
    preEscrowSnapshot: serializeEscrow(preEscrow),
    preEconomicsSnapshot: serializeEconomics(preEconomics),
    verified: false,
  };
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
