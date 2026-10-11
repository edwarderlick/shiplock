/**
 * test_evidence_harness.mjs
 *
 * Focused unit tests for ShipLock steward evidence harness:
 * 1. PyPI /pypi/{package}/{version}/json parsing using urls[] and non-yanked timestamps (no releases key)
 * 2. npm metadata parsing matching contract rules
 * 3. Candidate release runner fail-closed policies:
 *    - Halts without write on missing, inconclusive, yanked, or out-of-window
 *    - Never sets verified=true unless finalized return, RELEASED/200_IN_WINDOW, exact payout, and economics all pass
 * 4. Pre-transaction baseline snapshot persistence and crash-recovery reconciliation
 * 5. Pending in-window 404 transaction cross-boundary reconciliation before final settlement
 * 6. Atomic evidence file persistence & economics delta validation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  atomicWriteJson,
  readJsonSafe,
  normPypiName,
  parseUtcIso,
  parsePypiVersionMetadata,
  parseNpmMetadata,
  verifyEconomicsDelta,
  reconcilePendingTransaction,
  executeWithBaselineSnapshot,
  executeWithPendingRecovery,
  runInWindowCheckStep,
  syncAttemptHistory,
  serializeEscrow,
  serializeEconomics,
} from "../scripts/evidence_helper.mjs";

describe("ShipLock Steward Evidence Harness Tests", () => {
  describe("1. PyPI Version Endpoint Parsing (urls[] without releases key)", () => {
    it("parses representative real version response shape with urls[] and no releases key", () => {
      // Real PyPI /pypi/{pkg}/{ver}/json response shape: has info and urls, NO releases key
      const realPypiResponse = {
        info: {
          name: "shiplock-steward-release-live",
          version: "1.0.0",
          summary: "ShipLock steward release package",
          yanked: false,
          yanked_reason: null,
        },
        urls: [
          {
            comment_text: "",
            digests: {
              blake2b_256: "abcdef123456",
              md5: "0123456789abcdef0123456789abcdef",
              sha256: "fedcba9876543210fedcba9876543210",
            },
            filename: "shiplock_steward_release_live-1.0.0-py3-none-any.whl",
            has_sig: false,
            packagetype: "bdist_wheel",
            python_version: "py3",
            requires_python: ">=3.10",
            size: 1542,
            upload_time: "2026-10-12 12:35:00",
            upload_time_iso_8601: "2026-10-12T12:35:00.000000Z",
            url: "https://files.pythonhosted.org/packages/.../wheel.whl",
            yanked: false,
            yanked_reason: null,
          },
          {
            filename: "shiplock_steward_release_live-1.0.0.tar.gz",
            packagetype: "sdist",
            python_version: "source",
            size: 1200,
            upload_time: "2026-10-12 12:35:10",
            upload_time_iso_8601: "2026-10-12T12:35:10.000000Z",
            yanked: false,
            yanked_reason: null,
          },
        ],
        last_serial: 987654321,
      };

      // Explicitly assert that 'releases' key does NOT exist
      assert.equal("releases" in realPypiResponse, false);

      const parsed = parsePypiVersionMetadata(
        realPypiResponse,
        "shiplock-steward-release-live",
        "1.0.0"
      );

      assert.equal(parsed.status_code, 200);
      assert.equal(parsed.kind, "200");
      assert.equal(parsed.yanked, false);
      assert.equal(parsed.publish_time, "2026-10-12T12:35:00.000000Z");
    });

    it("ignores yanked files and selects the earliest non-yanked file timestamp", () => {
      const responseWithYankedFile = {
        info: {
          name: "shiplock-pkg",
          version: "1.0.0",
          yanked: false,
        },
        urls: [
          {
            filename: "bad-file.whl",
            upload_time_iso_8601: "2026-10-12T11:00:00.000000Z",
            yanked: true,
            yanked_reason: "broken build",
          },
          {
            filename: "good-file.whl",
            upload_time_iso_8601: "2026-10-12T12:15:00.000000Z",
            yanked: false,
          },
          {
            filename: "good-file.tar.gz",
            upload_time_iso_8601: "2026-10-12T12:20:00.000000Z",
            yanked: false,
          },
        ],
      };

      const parsed = parsePypiVersionMetadata(responseWithYankedFile, "shiplock-pkg", "1.0.0");
      assert.equal(parsed.kind, "200");
      assert.equal(parsed.yanked, false);
      // Must ignore 11:00 (yanked) and use earliest non-yanked (12:15)
      assert.equal(parsed.publish_time, "2026-10-12T12:15:00.000000Z");
    });

    it("marks release yanked when info.yanked is true or all files are yanked", () => {
      const infoYankedResp = {
        info: {
          name: "shiplock-pkg",
          version: "1.0.0",
          yanked: true,
          yanked_reason: "security issue",
        },
        urls: [
          {
            upload_time_iso_8601: "2026-10-12T12:00:00.000000Z",
            yanked: false,
          },
        ],
      };

      const parsed1 = parsePypiVersionMetadata(infoYankedResp, "shiplock-pkg", "1.0.0");
      assert.equal(parsed1.kind, "200");
      assert.equal(parsed1.yanked, true);
      assert.equal(parsed1.publish_time, "2026-10-12T12:00:00.000000Z");

      const allFilesYankedResp = {
        info: {
          name: "shiplock-pkg",
          version: "1.0.0",
          yanked: false,
        },
        urls: [
          {
            upload_time_iso_8601: "2026-10-12T12:00:00.000000Z",
            yanked: true,
          },
        ],
      };

      const parsed2 = parsePypiVersionMetadata(allFilesYankedResp, "shiplock-pkg", "1.0.0");
      assert.equal(parsed2.kind, "200");
      assert.equal(parsed2.yanked, true);
    });

    it("returns inconclusive when urls[] is empty or lacks usable non-yanked timestamp", () => {
      const emptyUrlsResp = {
        info: {
          name: "shiplock-pkg",
          version: "1.0.0",
          yanked: false,
        },
        urls: [],
      };

      const parsedEmpty = parsePypiVersionMetadata(emptyUrlsResp, "shiplock-pkg", "1.0.0");
      assert.equal(parsedEmpty.kind, "inconclusive");
      assert.equal(parsedEmpty.publish_time, "");

      const invalidTimeResp = {
        info: {
          name: "shiplock-pkg",
          version: "1.0.0",
          yanked: false,
        },
        urls: [{ upload_time: "not-a-timestamp", yanked: false }],
      };

      const parsedInvalid = parsePypiVersionMetadata(invalidTimeResp, "shiplock-pkg", "1.0.0");
      assert.equal(parsedInvalid.kind, "inconclusive");
    });

    it("returns mismatch when package name or version differs", () => {
      const resp = {
        info: {
          name: "different-pkg",
          version: "1.0.0",
        },
        urls: [],
      };
      const parsedName = parsePypiVersionMetadata(resp, "target-pkg", "1.0.0");
      assert.equal(parsedName.kind, "mismatch");

      const respVer = {
        info: {
          name: "target-pkg",
          version: "2.0.0",
        },
        urls: [],
      };
      const parsedVer = parsePypiVersionMetadata(respVer, "target-pkg", "1.0.0");
      assert.equal(parsedVer.kind, "mismatch");
    });
  });

  describe("2. Release Candidate Policy (Halts without write on missing/inconclusive/yanked/out-of-window)", () => {
    const windowStart = new Date("2026-10-12T12:00:00Z");
    const windowEnd = new Date("2026-10-14T12:00:00Z");

    function evaluateCandidateEvidence(regCheck, start, end) {
      if (regCheck.statusCode === 404 || regCheck.kind === "404") {
        return { shouldSubmit: false, reason: "AWAITING_PUBLICATION", error: "Missing (404)" };
      }
      if (regCheck.kind !== "200") {
        return { shouldSubmit: false, reason: "REGISTRY_INCONCLUSIVE", error: regCheck.error || regCheck.summary };
      }
      if (regCheck.isYanked) {
        return { shouldSubmit: false, reason: "YANKED", error: "Version is yanked" };
      }
      const pubDt = regCheck.publishTime ? parseUtcIso(regCheck.publishTime) : null;
      if (!pubDt) {
        return { shouldSubmit: false, reason: "REGISTRY_INCONCLUSIVE", error: "Unparseable publish timestamp" };
      }
      if (pubDt < start || pubDt > end) {
        return { shouldSubmit: false, reason: "OUT_OF_WINDOW", error: "Publication timestamp outside window" };
      }
      return { shouldSubmit: true, pubDt };
    }

    it("halts without write on 404 missing evidence", () => {
      const regCheck = { statusCode: 404, exists: false, kind: "404" };
      const outcome = evaluateCandidateEvidence(regCheck, windowStart, windowEnd);
      assert.equal(outcome.shouldSubmit, false);
      assert.equal(outcome.reason, "AWAITING_PUBLICATION");
    });

    it("halts without write on inconclusive registry evidence", () => {
      const regCheck = { statusCode: 200, exists: false, kind: "inconclusive", error: "no usable timestamp" };
      const outcome = evaluateCandidateEvidence(regCheck, windowStart, windowEnd);
      assert.equal(outcome.shouldSubmit, false);
      assert.equal(outcome.reason, "REGISTRY_INCONCLUSIVE");
    });

    it("halts without write on yanked release", () => {
      const regCheck = { statusCode: 200, exists: true, kind: "200", isYanked: true, publishTime: "2026-10-12T12:30:00Z" };
      const outcome = evaluateCandidateEvidence(regCheck, windowStart, windowEnd);
      assert.equal(outcome.shouldSubmit, false);
      assert.equal(outcome.reason, "YANKED");
    });

    it("halts without write on out-of-window publication timestamp (before window_start)", () => {
      const regCheck = {
        statusCode: 200,
        exists: true,
        kind: "200",
        isYanked: false,
        publishTime: "2026-10-12T11:00:00Z", // 1h before window_start
      };
      const outcome = evaluateCandidateEvidence(regCheck, windowStart, windowEnd);
      assert.equal(outcome.shouldSubmit, false);
      assert.equal(outcome.reason, "OUT_OF_WINDOW");
    });

    it("halts without write on out-of-window publication timestamp (after window_end)", () => {
      const regCheck = {
        statusCode: 200,
        exists: true,
        kind: "200",
        isYanked: false,
        publishTime: "2026-10-14T12:05:00Z", // 5min after window_end
      };
      const outcome = evaluateCandidateEvidence(regCheck, windowStart, windowEnd);
      assert.equal(outcome.shouldSubmit, false);
      assert.equal(outcome.reason, "OUT_OF_WINDOW");
    });

    it("permits submission only on trustworthy in-window non-yanked publication", () => {
      const regCheck = {
        statusCode: 200,
        exists: true,
        kind: "200",
        isYanked: false,
        publishTime: "2026-10-12T12:30:00Z", // inside [start, end]
      };
      const outcome = evaluateCandidateEvidence(regCheck, windowStart, windowEnd);
      assert.equal(outcome.shouldSubmit, true);
    });
  });

  describe("3. Strict Candidate Verification Criteria (Never set verified=true on partial success)", () => {
    it("fails closed if execution reverts", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "EXECUTION_REVERTED",
        }),
        waitForTransactionReceipt: async () => {},
      };

      const record = {
        releaseAttempt: {
          txHash: "0xreverted_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
        },
      };

      await assert.rejects(async () => {
        await reconcilePendingTransaction({
          client: mockClient,
          contractAddress: "0xcontract",
          escrowId: "0xescrow",
          record,
          stepKey: "releaseAttempt",
          expectedEscrowStatus: "RELEASED",
          expectedMatchReason: "200_IN_WINDOW",
          expectedEconomicsDelta: "PAYOUT",
          amountWei: "10000000000000000",
          saveEvidence: () => {},
        });
      }, /failed closed/);

      assert.equal(record.releaseAttempt.verified, false);
      assert.equal(record.releaseAttempt.failed, true);
    });

    it("fails closed if post-state status is not RELEASED", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "OPEN", // Did not transition to RELEASED
              match_reason: "WINDOW_OPEN_NO_HIT",
              payout: 0n,
            };
          }
          if (functionName === "get_economics") {
            return { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
          }
        },
      };

      const record = {
        releaseAttempt: {
          txHash: "0xok_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
        },
      };

      await assert.rejects(async () => {
        await reconcilePendingTransaction({
          client: mockClient,
          contractAddress: "0xcontract",
          escrowId: "0xescrow",
          record,
          stepKey: "releaseAttempt",
          expectedEscrowStatus: "RELEASED",
          expectedMatchReason: "200_IN_WINDOW",
          expectedEconomicsDelta: "PAYOUT",
          amountWei: "10000000000000000",
          saveEvidence: () => {},
        });
      }, /Escrow post-state mismatch: expected status RELEASED/);

      assert.notEqual(record.releaseAttempt.verified, true);
    });

    it("fails closed if match_reason is not 200_IN_WINDOW", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "RELEASED",
              match_reason: "WRONG_REASON",
              payout: 10000000000000000n,
            };
          }
          if (functionName === "get_economics") {
            return { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" };
          }
        },
      };

      const record = {
        releaseAttempt: {
          txHash: "0xok_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
        },
      };

      await assert.rejects(async () => {
        await reconcilePendingTransaction({
          client: mockClient,
          contractAddress: "0xcontract",
          escrowId: "0xescrow",
          record,
          stepKey: "releaseAttempt",
          expectedEscrowStatus: "RELEASED",
          expectedMatchReason: "200_IN_WINDOW",
          expectedEconomicsDelta: "PAYOUT",
          amountWei: "10000000000000000",
          saveEvidence: () => {},
        });
      }, /Escrow match_reason mismatch: expected 200_IN_WINDOW/);

      assert.notEqual(record.releaseAttempt.verified, true);
    });

    it("fails closed if payout does not equal exact escrow amount", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "RELEASED",
              match_reason: "200_IN_WINDOW",
              payout: 5000000000000000n, // Partial payout!
            };
          }
          if (functionName === "get_economics") {
            return { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" };
          }
        },
      };

      const record = {
        releaseAttempt: {
          txHash: "0xok_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
        },
      };

      await assert.rejects(async () => {
        await reconcilePendingTransaction({
          client: mockClient,
          contractAddress: "0xcontract",
          escrowId: "0xescrow",
          record,
          stepKey: "releaseAttempt",
          expectedEscrowStatus: "RELEASED",
          expectedMatchReason: "200_IN_WINDOW",
          expectedEconomicsDelta: "PAYOUT",
          amountWei: "10000000000000000",
          saveEvidence: () => {},
        });
      }, /Payout mismatch on RELEASED/);

      assert.notEqual(record.releaseAttempt.verified, true);
    });

    it("fails closed if economics delta does not match PAYOUT", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "RELEASED",
              match_reason: "200_IN_WINDOW",
              payout: 10000000000000000n,
            };
          }
          if (functionName === "get_economics") {
            // Economics did not update!
            return { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
          }
        },
      };

      const record = {
        releaseAttempt: {
          txHash: "0xok_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
        },
      };

      await assert.rejects(async () => {
        await reconcilePendingTransaction({
          client: mockClient,
          contractAddress: "0xcontract",
          escrowId: "0xescrow",
          record,
          stepKey: "releaseAttempt",
          expectedEscrowStatus: "RELEASED",
          expectedMatchReason: "200_IN_WINDOW",
          expectedEconomicsDelta: "PAYOUT",
          amountWei: "10000000000000000",
          saveEvidence: () => {},
        });
      }, /Economics mismatch/);

      assert.notEqual(record.releaseAttempt.verified, true);
    });

    it("sets verified=true only when all 4 conditions succeed", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "RELEASED",
              match_reason: "200_IN_WINDOW",
              payout: 10000000000000000n,
              recipient: "0xrecipient",
            };
          }
          if (functionName === "get_economics") {
            return {
              escrowed_open: "0",
              paid_to_recipients: "10000000000000000",
              refunded_to_funders: "0",
            };
          }
        },
      };

      const record = {
        releaseAttempt: {
          txHash: "0xperfect_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
        },
      };

      let saveCount = 0;
      await reconcilePendingTransaction({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: "0xescrow",
        record,
        stepKey: "releaseAttempt",
        expectedEscrowStatus: "RELEASED",
        expectedMatchReason: "200_IN_WINDOW",
        expectedEconomicsDelta: "PAYOUT",
        amountWei: "10000000000000000",
        saveEvidence: () => { saveCount++; },
      });

      assert.equal(record.releaseAttempt.verified, true);
      assert.equal(record.releaseAttempt.resultingEscrowStatus, "RELEASED");
      assert.equal(record.releaseAttempt.resultingMatchReason, "200_IN_WINDOW");
      assert.equal(record.releaseAttempt.payoutWei, "10000000000000000");
      assert(saveCount > 0);
    });
  });

  describe("4. Baseline Snapshot Persistence and Restart Reconciliation", () => {
    it("persists pre-transaction escrow & economics baseline snapshots alongside pending hash before receipt", async () => {
      let receiptWaitStarted = false;
      let snapshotPersistedBeforeReceipt = false;

      const record = {};
      const mockPreEscrow = { status: "OPEN", amount: 20000000000000000n, match_reason: "INIT", payout: 0n, refund: 0n };
      const mockPreEcon = { escrowed_open: 20000000000000000n, paid_to_recipients: 0n, refunded_to_funders: 0n };

      const mockClient = {
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return receiptWaitStarted
              ? { status: "OPEN", amount: 20000000000000000n, match_reason: "EARLY_404_RETRYABLE", payout: 0n, refund: 0n }
              : mockPreEscrow;
          }
          if (functionName === "get_economics") {
            return mockPreEcon;
          }
        },
        waitForTransactionReceipt: async () => {
          receiptWaitStarted = true;
        },
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
      };

      const saveEvidence = () => {
        if (!receiptWaitStarted && record.step1?.preEscrowSnapshot && record.step1?.preEconomicsSnapshot) {
          snapshotPersistedBeforeReceipt = true;
        }
      };

      await executeWithBaselineSnapshot({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: "0xid",
        record,
        stepKey: "step1",
        submitFn: async () => "0xbaseline_hash_1",
        expectedEscrowStatus: "OPEN",
        expectedMatchReason: null,
        expectedEconomicsDelta: "NO_CHANGE",
        amountWei: "20000000000000000",
        saveEvidence,
      });

      assert.equal(snapshotPersistedBeforeReceipt, true);
      assert.equal(record.step1.preEscrowSnapshot.amount, "20000000000000000");
      assert.equal(record.step1.preEconomicsSnapshot.escrowed_open, "20000000000000000");
      assert.equal(record.step1.verified, true);
    });

    it("reconciles baseline on restart without calling submitFn", async () => {
      let submitCalled = false;
      const record = {
        step1: {
          txHash: "0xpending_hash_saved_before_crash",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "20000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "20000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
        },
      };

      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return { status: "OPEN", amount: 20000000000000000n, payout: 0n, refund: 0n };
          }
          if (functionName === "get_economics") {
            return { escrowed_open: "20000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
          }
        },
      };

      await executeWithBaselineSnapshot({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: "0xid",
        record,
        stepKey: "step1",
        submitFn: async () => {
          submitCalled = true;
          return "0xshould_never_be_called";
        },
        expectedEscrowStatus: "OPEN",
        expectedMatchReason: null,
        expectedEconomicsDelta: "NO_CHANGE",
        amountWei: "20000000000000000",
        saveEvidence: () => {},
      });

      assert.equal(submitCalled, false, "Must not resubmit when pending transaction exists on restart!");
      assert.equal(record.step1.verified, true);
      assert.equal(record.step1.reconciledFromPending, true);
    });
  });

  describe("5. In-Window 404 Proof Strictness & Cross-Boundary On-Chain Execution", () => {
    it("verifies in-window 404 proof strictly requires EARLY_404_RETRYABLE with OPEN and unchanged economics", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "OPEN",
              match_reason: "EARLY_404_RETRYABLE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 0n,
            };
          }
          if (functionName === "get_economics") {
            return {
              escrowed_open: "60000000000000000",
              paid_to_recipients: "0",
              refunded_to_funders: "10000000000000000",
            };
          }
        },
      };

      const record = {
        inWindowAttempt: {
          txHash: "0xearly_404_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "20000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "60000000000000000", paid_to_recipients: "0", refunded_to_funders: "10000000000000000" },
          verified: false,
        },
      };

      const result = await reconcilePendingTransaction({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: "0xescrow",
        record,
        stepKey: "inWindowAttempt",
        expectedEscrowStatus: "OPEN",
        expectedMatchReason: "EARLY_404_RETRYABLE",
        expectedEconomicsDelta: "NO_CHANGE",
        amountWei: "20000000000000000",
        requireEarly404: true,
        saveEvidence: () => {},
      });

      assert.equal(result.verified, true);
      assert.equal(record.inWindowAttempt.verified, true);
      assert.equal(record.inWindowAttempt.resultingEscrowStatus, "OPEN");
      assert.equal(record.inWindowAttempt.resultingMatchReason, "EARLY_404_RETRYABLE");
    });

    it("records temporary registry failure separately in attempt history, marks attempt complete, and keeps early 404 proof unverified", async () => {
      // Contract lines 594-597: temporary failure produces EARLY_UNAVAILABLE_RETRYABLE
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "OPEN",
              match_reason: "EARLY_UNAVAILABLE_RETRYABLE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 0n,
            };
          }
          if (functionName === "get_economics") {
            return {
              escrowed_open: "60000000000000000",
              paid_to_recipients: "0",
              refunded_to_funders: "10000000000000000",
            };
          }
        },
      };

      const record = {
        inWindowAttempt: {
          txHash: "0xtemporary_fail_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "20000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "60000000000000000", paid_to_recipients: "0", refunded_to_funders: "10000000000000000" },
          verified: false,
        },
        inWindowAttempts: [],
      };

      const result = await reconcilePendingTransaction({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: "0xescrow",
        record,
        stepKey: "inWindowAttempt",
        expectedEscrowStatus: "OPEN",
        expectedMatchReason: "EARLY_404_RETRYABLE",
        expectedEconomicsDelta: "NO_CHANGE",
        amountWei: "20000000000000000",
        requireEarly404: true,
        saveEvidence: () => {},
      });

      assert.equal(result.verified, false);
      assert.equal(record.inWindowAttempt.verified, false, "Must NOT mark 404 proof verified on temporary registry failure!");
      assert.equal(record.inWindowAttempt.completed, true, "Attempt must be marked completed!");
      assert.equal(record.inWindowAttempt.temporaryRegistryFailure, true);
      assert.equal(record.inWindowAttempt.resultingMatchReason, "EARLY_UNAVAILABLE_RETRYABLE");
      assert.equal(record.early404Verified, false);
      assert.equal(record.inWindowAttempts.length, 1, "Attempt must be preserved in history");
      assert.equal(record.inWindowAttempts[0].txHash, "0xtemporary_fail_tx");
      assert.equal(record.inWindowAttempts[0].completed, true);
      assert(record.inWindowAttempt.finding.includes("Temporary registry failure"));
    });

    it("handles window_end boundary using executed on-chain outcome: verifies refund settlement while early 404 proof is NOT verified, preventing duplicate settlement", async () => {
      // Scenario: Transaction submitted locally as inWindowAttempt.
      // On-chain execution occurred after window_end, producing REFUND_NOHIT and WINDOW_EXPIRED_NO_RELEASE.
      // The runner must reconcile that outcome safely as final settlement evidence, NOT count it as early 404 proof, and NOT submit another settlement.
      let duplicateSettlementSubmitted = false;

      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "REFUND_NOHIT",
              match_reason: "WINDOW_EXPIRED_NO_RELEASE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 20000000000000000n,
            };
          }
          if (functionName === "get_economics") {
            // Post-refund economics
            return {
              escrowed_open: "40000000000000000",
              paid_to_recipients: "0",
              refunded_to_funders: "30000000000000000",
            };
          }
        },
      };

      const record = {
        id: "0xescrow404",
        principalWei: "20000000000000000",
        early404Verified: false,
        refundSettlementVerified: false,
        inWindowAttempt: {
          txHash: "0xcross_boundary_in_window_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "20000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "60000000000000000", paid_to_recipients: "0", refunded_to_funders: "10000000000000000" },
          verified: false,
        },
        inWindowAttempts: [],
      };

      // 1. Reconcile in-window attempt with cross-boundary handling enabled
      const result = await reconcilePendingTransaction({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: record.id,
        record,
        stepKey: "inWindowAttempt",
        expectedEscrowStatus: "OPEN",
        expectedMatchReason: "EARLY_404_RETRYABLE",
        expectedEconomicsDelta: "NO_CHANGE",
        amountWei: record.principalWei,
        allowCrossBoundaryRefund: true,
        requireEarly404: true,
        saveEvidence: () => {},
      });

      assert.equal(result.executedAfterWindowEnd, true);
      assert.equal(record.inWindowAttempt.resultingEscrowStatus, "REFUND_NOHIT");
      assert.equal(record.inWindowAttempt.resultingMatchReason, "WINDOW_EXPIRED_NO_RELEASE");

      // Verify cross-boundary assertion: refund settlement is verified while early 404 proof is NOT
      assert.equal(record.refundSettlementVerified, true, "Refund settlement must be marked verified");
      assert.equal(record.early404Verified, false, "Early 404 proof must NOT be marked verified for cross-boundary refund");
      assert.equal(record.inWindowAttempt.early404Verified, false);
      assert.equal(record.inWindowAttempt.verified, false);
      assert.equal(record.postWindowSettlement.verified, true);
      assert.equal(record.postWindowSettlement.resultingEscrowStatus, "REFUND_NOHIT");
      assert.equal(record.postWindowSettlement.funderRefundWei, "20000000000000000");
      assert.equal(record.finalState.settled, true);

      // 2. Verify runner policy at window_end: since refundSettlementVerified is true, NO duplicate settlement is sent!
      const shouldSubmitPostWindow = !record.refundSettlementVerified && !record.postWindowSettlement?.verified && record.finalState?.status !== "REFUND_NOHIT";
      if (shouldSubmitPostWindow) {
        duplicateSettlementSubmitted = true;
      }
      assert.equal(duplicateSettlementSubmitted, false, "Must NOT submit a second settlement transaction when cross-boundary settlement succeeded!");
    });

    it("runner-level flow invoked twice: first finalized temporary failure, then distinct finalized EARLY_404_RETRYABLE; asserts both hashes remain in evidence and only second verifies 404 proof", async () => {
      let runCount = 0;
      const submittedHashes = [];

      const mockClient = {
        getTransaction: async ({ hash }) => {
          if (hash === "0xtemp_failure_tx" || hash === "0xearly_404_success_tx") {
            return {
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
            };
          }
          throw new Error(`Unknown hash ${hash}`);
        },
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            if (runCount === 1) {
              // First run outcome: temporary registry failure (e.g. EARLY_UNAVAILABLE_RETRYABLE)
              return {
                status: "OPEN",
                match_reason: "EARLY_UNAVAILABLE_RETRYABLE",
                amount: 20000000000000000n,
                payout: 0n,
                refund: 0n,
              };
            }
            // Second run outcome: clean early 404 proof
            return {
              status: "OPEN",
              match_reason: "EARLY_404_RETRYABLE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 0n,
            };
          }
          if (functionName === "get_economics") {
            return {
              escrowed_open: "60000000000000000",
              paid_to_recipients: "0",
              refunded_to_funders: "10000000000000000",
            };
          }
        },
        waitForTransactionReceipt: async () => {},
      };

      const record = {
        id: "0xescrow404",
        principalWei: "20000000000000000",
        early404Verified: false,
        refundSettlementVerified: false,
        inWindowAttempts: [],
      };

      // RUN 1: Temporary failure
      runCount = 1;
      const run1Result = await runInWindowCheckStep({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: record.id,
        record,
        submitFn: async () => {
          const h = "0xtemp_failure_tx";
          submittedHashes.push(h);
          return h;
        },
        saveEvidence: () => {},
      });

      // Assert Run 1 outcome:
      assert.equal(submittedHashes.length, 1);
      assert.equal(submittedHashes[0], "0xtemp_failure_tx");
      assert.equal(run1Result.temporaryRegistryFailure, true);
      assert.equal(run1Result.verified, false);
      assert.equal(record.early404Verified, false, "404 proof must NOT be marked verified on temporary failure");
      assert.equal(record.inWindowAttempt.completed, true, "First attempt must be marked complete");
      assert.equal(record.inWindowAttempt.temporaryRegistryFailure, true);
      assert.equal(record.inWindowAttempts.length, 1, "First attempt must be preserved in history");
      assert.equal(record.inWindowAttempts[0].txHash, "0xtemp_failure_tx");
      assert.equal(record.inWindowAttempts[0].verified, false);

      // RUN 2: Inside window again, retry allowed with distinct transaction
      runCount = 2;
      const run2Result = await runInWindowCheckStep({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: record.id,
        record,
        submitFn: async () => {
          const h = "0xearly_404_success_tx";
          submittedHashes.push(h);
          return h;
        },
        saveEvidence: () => {},
      });

      // Assert Run 2 outcome:
      assert.equal(submittedHashes.length, 2, "Second run must submit a new transaction");
      assert.equal(submittedHashes[1], "0xearly_404_success_tx");
      assert.equal(run2Result.verified, true);
      assert.equal(run2Result.early404Verified, true);
      assert.equal(record.early404Verified, true, "Second run must verify early 404 proof");
      assert.equal(record.inWindowAttempt.txHash, "0xearly_404_success_tx");
      assert.equal(record.inWindowAttempt.resultingMatchReason, "EARLY_404_RETRYABLE");

      // Core requirements:
      // 1. Both hashes remain in evidence
      assert.equal(record.inWindowAttempts.length, 2, "Both attempts must remain in evidence history");
      assert.equal(record.inWindowAttempts[0].txHash, "0xtemp_failure_tx");
      assert.equal(record.inWindowAttempts[1].txHash, "0xearly_404_success_tx");

      // 2. Only the second verifies the 404 proof
      assert.equal(record.inWindowAttempts[0].verified, false, "Attempt 1 must NOT verify 404 proof");
      assert.equal(record.inWindowAttempts[1].verified, true, "Attempt 2 MUST verify 404 proof");
      assert.equal(record.inWindowAttempts[0].temporaryRegistryFailure, true);
      assert.equal(record.inWindowAttempts[1].early404Verified, true);
    });

    it("never overwrites or resubmits a genuinely pending transaction hash", async () => {
      let submitCallCount = 0;
      let receiptWaitCalled = false;

      const mockClient = {
        getTransaction: async ({ hash }) => {
          if (hash === "0xpending_tx") {
            if (!receiptWaitCalled) {
              return { statusName: "PENDING", txExecutionResultName: "" };
            }
            return { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" };
          }
        },
        waitForTransactionReceipt: async () => {
          receiptWaitCalled = true;
        },
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "OPEN",
              match_reason: "EARLY_404_RETRYABLE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 0n,
            };
          }
          if (functionName === "get_economics") {
            return {
              escrowed_open: "60000000000000000",
              paid_to_recipients: "0",
              refunded_to_funders: "10000000000000000",
            };
          }
        },
      };

      const record = {
        id: "0xescrow404",
        principalWei: "20000000000000000",
        early404Verified: false,
        refundSettlementVerified: false,
        inWindowAttempt: {
          txHash: "0xpending_tx",
          txStatus: "PENDING",
          completed: false,
          preEscrowSnapshot: { status: "OPEN", amount: "20000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "60000000000000000", paid_to_recipients: "0", refunded_to_funders: "10000000000000000" },
        },
        inWindowAttempts: [],
      };

      await runInWindowCheckStep({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: record.id,
        record,
        submitFn: async () => {
          submitCallCount++;
          return "0xnew_tx_should_never_be_called";
        },
        saveEvidence: () => {},
      });

      assert.equal(submitCallCount, 0, "Must NEVER submit a new transaction while an existing hash is pending!");
      assert.equal(receiptWaitCalled, true, "Must await finalization of existing pending hash");
      assert.equal(record.inWindowAttempt.txHash, "0xpending_tx", "Must not overwrite existing pending hash");
      assert.equal(record.early404Verified, true);
    });

    it("reconciles in-window pending check executing in-window before window_end first, allowing subsequent post-window settlement", async () => {
      let inWindowReconciledBeforeSettlement = false;
      let settlementExecuted = false;
      let postWindowSettled = false;

      const record = {
        id: "0xescrow404",
        principalWei: "20000000000000000",
        inWindowAttempt: {
          txHash: "0xin_window_tx_submitted_at_deadline",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "20000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "60000000000000000", paid_to_recipients: "0", refunded_to_funders: "10000000000000000" },
          verified: false,
        },
      };

      const mockClient = {
        getTransaction: async ({ hash }) => {
          if (hash === record.inWindowAttempt.txHash) {
            return {
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
            };
          }
          if (hash === "0xpost_window_settle_tx") {
            return {
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
            };
          }
        },
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            if (!postWindowSettled) {
              // Pre-settlement state: OPEN, EARLY_404_RETRYABLE
              return {
                status: "OPEN",
                match_reason: "EARLY_404_RETRYABLE",
                amount: 20000000000000000n,
                payout: 0n,
                refund: 0n,
              };
            }
            // After postWindowSettlement: REFUND_NOHIT
            return {
              status: "REFUND_NOHIT",
              match_reason: "WINDOW_EXPIRED_NO_RELEASE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 20000000000000000n,
            };
          }
          if (functionName === "get_economics") {
            if (!postWindowSettled) {
              // Pre-settlement economics
              return {
                escrowed_open: "60000000000000000",
                paid_to_recipients: "0",
                refunded_to_funders: "10000000000000000",
              };
            }
            // Post-window settlement refunded 0.02 GEN
            return {
              escrowed_open: "40000000000000000",
              paid_to_recipients: "0",
              refunded_to_funders: "30000000000000000",
            };
          }
        },
        waitForTransactionReceipt: async () => {},
      };

      // Simulating runner execution when now >= window_end:
      // STEP 1: Must reconcile pending inWindowAttempt FIRST
      if (record.inWindowAttempt?.txHash && !record.inWindowAttempt?.verified) {
        await reconcilePendingTransaction({
          client: mockClient,
          contractAddress: "0xcontract",
          escrowId: record.id,
          record,
          stepKey: "inWindowAttempt",
          expectedEscrowStatus: "OPEN",
          expectedMatchReason: "EARLY_404_RETRYABLE",
          expectedEconomicsDelta: "NO_CHANGE",
          amountWei: record.principalWei,
          allowCrossBoundaryRefund: true,
          requireEarly404: true,
          saveEvidence: () => {},
        });
        inWindowReconciledBeforeSettlement = true;
      }

      assert.equal(inWindowReconciledBeforeSettlement, true);
      assert.equal(record.inWindowAttempt.verified, true);
      assert.equal(record.inWindowAttempt.resultingEscrowStatus, "OPEN");

      // STEP 2: Only after inWindowAttempt is verified does postWindowSettlement proceed!
      assert.equal(record.inWindowAttempt.verified, true);

      await executeWithBaselineSnapshot({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: record.id,
        record,
        stepKey: "postWindowSettlement",
        submitFn: async () => {
          postWindowSettled = true;
          return "0xpost_window_settle_tx";
        },
        expectedEscrowStatus: "REFUND_NOHIT",
        expectedMatchReason: "WINDOW_EXPIRED_NO_RELEASE",
        expectedEconomicsDelta: "REFUND",
        amountWei: record.principalWei,
        saveEvidence: () => {},
      });
      settlementExecuted = true;

      assert.equal(settlementExecuted, true);
      assert.equal(record.postWindowSettlement.verified, true);
      assert.equal(record.postWindowSettlement.resultingEscrowStatus, "REFUND_NOHIT");
    });
  });

  describe("6. Atomic Persistence & Economics Delta Validation", () => {
    it("validates economics deltas correctly", () => {
      const econBefore = {
        escrowed_open: "60000000000000000",
        paid_to_recipients: "0",
        refunded_to_funders: "10000000000000000",
      };
      const econAfterRefund = {
        escrowed_open: "40000000000000000",
        paid_to_recipients: "0",
        refunded_to_funders: "30000000000000000",
      };
      assert.doesNotThrow(() => {
        verifyEconomicsDelta({
          econBefore,
          econAfter: econAfterRefund,
          expectedType: "REFUND",
          amountWei: "20000000000000000",
        });
      });
    });

    it("writes valid JSON atomically without corrupting the file", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "shiplock-evidence-test-"));
      const testFile = join(tempDir, "evidence.json");

      try {
        const payload = {
          contractAddress: "0x7Cef756668Cd925807e8B110D0330643c6F809E3",
          items: [1, 2, 3],
          bigintVal: 10000000000000000n,
        };

        atomicWriteJson(testFile, payload);
        assert.equal(existsSync(testFile), true);

        const readBack = readJsonSafe(testFile);
        assert.equal(readBack.contractAddress, payload.contractAddress);
        assert.equal(readBack.bigintVal, "10000000000000000");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
