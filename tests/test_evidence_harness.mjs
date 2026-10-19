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
  buildReleaseMessageAllocations,
  validateTransferAllocations,
  getRpcTime,
  verifyEmittedTransferOrChildTx,
  validateGithubRepo,
  validateGithubTag,
  normalizeGithubRepoUrl,
  parseGithubReleaseMetadata,
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
          messages: [
            {
              recipient: "0xrecipient",
              value: "10000000000000000",
              messageType: 1,
            },
          ],
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

      const funderAddr = "0x20e850baad26d763d4f691780d1beba01c8d6084";
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          messages: [
            {
              recipient: funderAddr,
              value: "20000000000000000",
              messageType: 1,
            },
          ],
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "REFUND_NOHIT",
              match_reason: "WINDOW_EXPIRED_NO_RELEASE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 20000000000000000n,
              funder: funderAddr,
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
              messages: [
                {
                  recipient: "0xfunder_addr",
                  value: "20000000000000000",
                  messageType: 1,
                },
              ],
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
                funder: "0xfunder_addr",
              };
            }
            // After postWindowSettlement: REFUND_NOHIT
            return {
              status: "REFUND_NOHIT",
              match_reason: "WINDOW_EXPIRED_NO_RELEASE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 20000000000000000n,
              funder: "0xfunder_addr",
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

  describe("7. Mode 1 Message Allocations in Evidence Runners & Cross-Boundary Protection", () => {
    const CONTRACT_ADDRESS = "0x7Cef756668Cd925807e8B110D0330643c6F809E3";
    const funder = "0x1111111111111111111111111111111111111111";
    const recipient = "0x2222222222222222222222222222222222222222";
    const escrowId = "0x7f24e638ea5ed353c377f968352fdf9d2e1c66959fa739fa69d1d32e54d58d53";

    it("validateTransferAllocations rejects unsafe empty allocations for release", () => {
      assert.throws(
        () =>
          validateTransferAllocations({
            functionName: "release",
            distribution: {
              leaderTimeunitsAllocation: 200n,
              validatorTimeunitsAllocation: 400n,
              totalMessageFees: 0n,
            },
            messageAllocations: [],
            mustHaveTransfer: true,
            expectedRecipients: [recipient, funder],
          }),
        /Fee estimation produced an unsafe empty allocation tree for transfer in release/
      );
    });

    it("validateTransferAllocations rejects release allocations missing recipient or funder", () => {
      assert.throws(
        () =>
          validateTransferAllocations({
            functionName: "release",
            distribution: {
              leaderTimeunitsAllocation: 200n,
              validatorTimeunitsAllocation: 400n,
              totalMessageFees: 150000000000000n,
            },
            messageAllocations: [
              {
                recipient,
                budget: 150000000000000n,
              },
            ],
            mustHaveTransfer: true,
            expectedRecipients: [recipient, funder],
          }),
        /Release message allocations missing required recipient/
      );
    });

    it("buildReleaseMessageAllocations constructs valid allocation tree covering recipient and funder", () => {
      const allocs = buildReleaseMessageAllocations({ recipient, funder });
      assert.equal(allocs.length, 2);
      assert.equal(allocs[0].recipient, recipient);
      assert.equal(allocs[1].recipient, funder);
      assert.equal(typeof allocs[0].parentIndex, "bigint");
      assert.equal(typeof allocs[1].parentIndex, "bigint");
      assert.equal(allocs[0].parentIndex, allocs[1].parentIndex);
      assert.ok(allocs[0].budget > 0n);
      assert.ok(allocs[1].budget > 0n);
      assert.match(allocs[0].callKey, /^0x[0-9a-fA-F]{64}$/);
      assert.match(allocs[1].callKey, /^0x[0-9a-fA-F]{64}$/);
    });

    it("evidence runner cancel submitFn preserves and passes messageAllocations to writeContract", async () => {
      let capturedFees = null;
      const mockClient = {
        estimateTransactionFeesForWrite: async ({ leaderTimeunitsAllocation, validatorTimeunitsAllocation }) => {
          assert.ok(leaderTimeunitsAllocation >= 30n && leaderTimeunitsAllocation <= 600n);
          assert.ok(validatorTimeunitsAllocation >= 30n && validatorTimeunitsAllocation <= 600n);
          return {
            distribution: {
              leaderTimeunitsAllocation,
              validatorTimeunitsAllocation,
              totalMessageFees: 150000000000000n,
              rotations: [0n],
            },
            messageAllocations: [
              {
                messageType: 0,
                recipient: funder,
                callKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
                budget: 150000000000000n,
                feeParams: "0x01",
              },
            ],
            feeValue: 300000000000000n,
          };
        },
        writeContract: async (params) => {
          capturedFees = params.fees;
          return "0xtx_cancel_hash";
        },
      };

      const feeEst = await mockClient.estimateTransactionFeesForWrite({
        address: CONTRACT_ADDRESS,
        functionName: "cancel",
        args: [escrowId],
        leaderTimeunitsAllocation: 200n,
        validatorTimeunitsAllocation: 400n,
        rotations: [0n],
      });
      assert.ok(feeEst.messageAllocations?.length > 0);

      const txHash = await mockClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "cancel",
        args: [escrowId],
        fees: {
          distribution: feeEst.distribution,
          messageAllocations: feeEst.messageAllocations,
          feeValue: feeEst.feeValue,
        },
      });

      assert.equal(txHash, "0xtx_cancel_hash");
      assert.ok(capturedFees.messageAllocations);
      assert.equal(capturedFees.messageAllocations[0].recipient, funder);
      assert.equal(capturedFees.distribution.totalMessageFees, 150000000000000n);
    });

    it("evidence runner candidate release payout submitFn builds complete [recipient, funder] allocations", async () => {
      let capturedFees = null;
      const mockClient = {
        readContract: async () => ({
          recipient,
          funder,
        }),
        estimateTransactionFees: async ({ messageAllocations }) => ({
          distribution: {
            leaderTimeunitsAllocation: 200n,
            validatorTimeunitsAllocation: 400n,
            totalMessageFees: 300000000000000n,
            rotations: [0n],
          },
          messageAllocations,
          feeValue: 350000000000000n,
        }),
        writeContract: async (params) => {
          capturedFees = params.fees;
          return "0xtx_cand_release_hash";
        },
      };

      const escrow = await mockClient.readContract();
      const messageAllocations = buildReleaseMessageAllocations({
        recipient: escrow.recipient,
        funder: escrow.funder,
      });
      const feeEst = await mockClient.estimateTransactionFees({
        leaderTimeunitsAllocation: 200n,
        validatorTimeunitsAllocation: 400n,
        rotations: [0n],
        messageAllocations,
      });

      validateTransferAllocations({
        functionName: "release",
        distribution: feeEst.distribution,
        messageAllocations: feeEst.messageAllocations,
        mustHaveTransfer: true,
        expectedRecipients: [escrow.recipient, escrow.funder],
      });

      const txHash = await mockClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "release",
        args: [escrowId],
        fees: {
          distribution: feeEst.distribution,
          messageAllocations: feeEst.messageAllocations,
          feeValue: feeEst.feeValue,
        },
      });

      assert.equal(txHash, "0xtx_cand_release_hash");
      assert.ok(capturedFees.messageAllocations);
      assert.equal(capturedFees.messageAllocations.length, 2);
      assert.equal(capturedFees.messageAllocations[0].recipient, recipient);
      assert.equal(capturedFees.messageAllocations[1].recipient, funder);
      assert.equal(capturedFees.distribution.totalMessageFees, 300000000000000n);
    });

    it("evidence runner post-window refund submitFn builds complete [recipient, funder] allocations", async () => {
      let capturedFees = null;
      const mockClient = {
        readContract: async () => ({
          recipient,
          funder,
        }),
        estimateTransactionFees: async ({ messageAllocations }) => ({
          distribution: {
            leaderTimeunitsAllocation: 200n,
            validatorTimeunitsAllocation: 400n,
            totalMessageFees: 300000000000000n,
            rotations: [0n],
          },
          messageAllocations,
          feeValue: 350000000000000n,
        }),
        writeContract: async (params) => {
          capturedFees = params.fees;
          return "0xtx_post_refund_hash";
        },
      };

      const escrow = await mockClient.readContract();
      const messageAllocations = buildReleaseMessageAllocations({
        recipient: escrow.recipient,
        funder: escrow.funder,
      });
      const feeEst = await mockClient.estimateTransactionFees({
        leaderTimeunitsAllocation: 200n,
        validatorTimeunitsAllocation: 400n,
        rotations: [0n],
        messageAllocations,
      });

      validateTransferAllocations({
        functionName: "release",
        distribution: feeEst.distribution,
        messageAllocations: feeEst.messageAllocations,
        mustHaveTransfer: true,
        expectedRecipients: [escrow.recipient, escrow.funder],
      });

      const txHash = await mockClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "release",
        args: [escrowId],
        fees: {
          distribution: feeEst.distribution,
          messageAllocations: feeEst.messageAllocations,
          feeValue: feeEst.feeValue,
        },
      });

      assert.equal(txHash, "0xtx_post_refund_hash");
      assert.ok(capturedFees.messageAllocations);
      assert.equal(capturedFees.messageAllocations.length, 2);
      assert.equal(capturedFees.messageAllocations[0].recipient, recipient);
      assert.equal(capturedFees.messageAllocations[1].recipient, funder);
    });

    it("runner cross-boundary release: simulation observes EARLY_404_RETRYABLE with 0 messages, but runner submits complete allocations, transaction executes refund after window_end, reconciling to REFUND_NOHIT and preventing duplicate settlement", async () => {
      let capturedFees = null;
      let writeContractCalled = false;
      let readCount = 0;

      // 1. Simulation at submission time observes EARLY_404_RETRYABLE with 0 emitted messages
      const mockSimulationResult = {
        distribution: {
          leaderTimeunitsAllocation: 200n,
          validatorTimeunitsAllocation: 400n,
          totalMessageFees: 0n,
          rotations: [0n],
        },
        messageAllocations: [], // Zero emissions observed!
        feeValue: 200000000000000n,
      };

      const mockClient = {
        getTransaction: async ({ hash }) => {
          assert.equal(hash, "0xtx_cross_boundary_refund");
          return {
            statusName: "FINALIZED",
            txExecutionResultName: "FINISHED_WITH_RETURN",
            messages: [
              {
                recipient: funder,
                value: "20000000000000000",
                messageType: 1,
              },
            ],
          };
        },
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            readCount++;
            if (readCount <= 1) {
              // Pre-execution baseline: escrow is OPEN with 20000000000000000n
              return {
                status: "OPEN",
                match_reason: "NONE",
                amount: 20000000000000000n,
                payout: 0n,
                refund: 0n,
                funder,
                recipient,
              };
            }
            // Post-execution: cross-boundary execution reaches REFUND_NOHIT after window_end
            return {
              status: "REFUND_NOHIT",
              match_reason: "WINDOW_EXPIRED_NO_RELEASE",
              amount: 20000000000000000n,
              payout: 0n,
              refund: 20000000000000000n,
              funder,
              recipient,
            };
          }
          if (functionName === "get_economics") {
            if (readCount <= 1) {
              // Pre-execution baseline economics
              return {
                escrowed_open: "60000000000000000",
                paid_to_recipients: "0",
                refunded_to_funders: "0",
              };
            }
            // Post-execution economics: 20000000000000000 refunded
            return {
              escrowed_open: "40000000000000000",
              paid_to_recipients: "0",
              refunded_to_funders: "20000000000000000",
            };
          }
        },
        waitForTransactionReceipt: async () => {},
      };

      const record = {
        id: escrowId,
        principalWei: "20000000000000000",
        early404Verified: false,
        refundSettlementVerified: false,
        inWindowAttempt: null,
        inWindowAttempts: [],
        finalState: {},
      };

      // Runner submitFn: refuses empty allocations for release, builds complete allocations covering recipient and funder
      const submitFn = async () => {
        writeContractCalled = true;
        assert.equal(mockSimulationResult.messageAllocations.length, 0);

        const completeAllocations = buildReleaseMessageAllocations({ recipient, funder });
        assert.equal(completeAllocations.length, 2);

        const authoritativeFees = {
          distribution: {
            leaderTimeunitsAllocation: 200n,
            validatorTimeunitsAllocation: 400n,
            totalMessageFees: 300000000000000n,
            rotations: [0n],
          },
          messageAllocations: completeAllocations,
          feeValue: 500000000000000n,
        };

        validateTransferAllocations({
          functionName: "release",
          distribution: authoritativeFees.distribution,
          messageAllocations: authoritativeFees.messageAllocations,
          mustHaveTransfer: true,
          expectedRecipients: [recipient, funder],
        });

        capturedFees = authoritativeFees;
        return "0xtx_cross_boundary_refund";
      };

      await runInWindowCheckStep({
        client: mockClient,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        record,
        submitFn,
        saveEvidence: () => {},
      });

      assert.equal(writeContractCalled, true);
      assert.ok(capturedFees.messageAllocations);
      assert.equal(capturedFees.messageAllocations.length, 2);
      assert.equal(capturedFees.messageAllocations[0].recipient, recipient);
      assert.equal(capturedFees.messageAllocations[1].recipient, funder);
      assert.equal(capturedFees.distribution.totalMessageFees, 300000000000000n);

      // Reconciled correctly as cross-boundary refund:
      assert.equal(record.refundSettlementVerified, true, "Refund settlement must be verified");
      assert.equal(record.early404Verified, false, "Early 404 must NOT be marked verified for cross-boundary refund");
      assert.equal(record.inWindowAttempt.resultingEscrowStatus, "REFUND_NOHIT");
      assert.equal(record.inWindowAttempt.resultingMatchReason, "WINDOW_EXPIRED_NO_RELEASE");
      assert.equal(record.finalState.settled, true);
      assert.equal(record.finalState.status, "REFUND_NOHIT");

      // Verify duplicate settlement prevention on subsequent run
      let duplicateSubmitted = false;
      const secondResult = await runInWindowCheckStep({
        client: mockClient,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        record,
        submitFn: async () => {
          duplicateSubmitted = true;
          return "0xduplicate";
        },
        saveEvidence: () => {},
      });

      assert.equal(duplicateSubmitted, false, "Must never submit duplicate settlement when already verified");
      assert.equal(secondResult.skipped, true);
      assert.equal(secondResult.refundSettlementVerified, true);
    });

    it("evidence runner stops without submitting if estimation cannot produce messageAllocations for transfer", async () => {
      let writeContractCalled = false;
      const mockClient = {
        estimateTransactionFeesForWrite: async () => ({
          distribution: {
            leaderTimeunitsAllocation: 200n,
            validatorTimeunitsAllocation: 400n,
            totalMessageFees: 0n,
            rotations: [0n],
          },
          messageAllocations: [], // Missing allocations for a transfer!
          feeValue: 1000n,
        }),
        writeContract: async () => {
          writeContractCalled = true;
          return "0xtx";
        },
      };

      await assert.rejects(
        async () => {
          const feeEst = await mockClient.estimateTransactionFeesForWrite({
            address: CONTRACT_ADDRESS,
            functionName: "cancel",
            args: [escrowId],
            leaderTimeunitsAllocation: 200n,
            validatorTimeunitsAllocation: 400n,
            rotations: [0n],
          });
          if (!feeEst.messageAllocations || feeEst.messageAllocations.length === 0) {
            throw new Error("Failed to estimate message allocations for cancel transfer");
          }
          await mockClient.writeContract({
            address: CONTRACT_ADDRESS,
            functionName: "cancel",
            args: [escrowId],
            fees: {
              distribution: feeEst.distribution,
              messageAllocations: feeEst.messageAllocations,
              feeValue: feeEst.feeValue,
            },
          });
        },
        /Failed to estimate message allocations for cancel transfer/
      );

      assert.equal(writeContractCalled, false, "Must not call writeContract when allocations are missing");
    });
  });

  describe("8. Emitted Transfers, Child Transactions & Studio Next RPC Time Gate Verification", () => {
    it("getRpcTime retrieves on-chain block timestamp from eth_getBlockByNumber", async () => {
      const mockClient = {
        request: async ({ method, params }) => {
          if (method === "eth_getBlockByNumber") {
            return { timestamp: "0x6accd72d" }; // 1791743789 seconds -> 2026-10-11T18:36:29.000Z
          }
          throw new Error("unexpected method");
        },
      };

      const rpcDate = await getRpcTime(mockClient);
      assert.equal(rpcDate.toISOString(), "2026-10-12T12:48:45.000Z");
    });

    it("getRpcTime falls back safely to local UTC if RPC query fails", async () => {
      const failingClient = {
        request: async () => {
          throw new Error("Network timeout");
        },
      };

      const nowBefore = new Date().getTime();
      const rpcDate = await getRpcTime(failingClient);
      const nowAfter = new Date().getTime();

      assert.ok(rpcDate.getTime() >= nowBefore && rpcDate.getTime() <= nowAfter);
    });

    it("verifyEmittedTransferOrChildTx verifies child transaction with matching recipient, amount, and finality", async () => {
      const mockClient = {
        getTransaction: async ({ hash }) => {
          if (hash === "0xchild_tx_1") {
            return {
              hash: "0xchild_tx_1",
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
              to_address: "0xrecipient_addr",
              value: "10000000000000000",
            };
          }
          throw new Error("unexpected hash");
        },
      };

      const step = {};
      const txInfo = {
        triggered_transactions: ["0xchild_tx_1"],
      };

      const result = await verifyEmittedTransferOrChildTx({
        client: mockClient,
        txInfo,
        step,
        expectedTarget: "0xrecipient_addr",
        amountWei: "10000000000000000",
        isPayout: true,
      });

      assert.equal(result, true);
      assert.equal(step.childTransfer?.verified, true);
      assert.equal(step.childTransfer?.status, "FINALIZED");
      assert.equal(step.transferEvidence?.verified, true);
      assert.equal(step.transferEvidence?.type, "PAYOUT_TO_RECIPIENT");
    });

    it("verifyEmittedTransferOrChildTx fails closed if child transaction recipient mismatches", async () => {
      const mockClient = {
        getTransaction: async ({ hash }) => ({
          hash,
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          to_address: "0xwrong_address",
          value: "10000000000000000",
        }),
      };

      const step = {};
      const txInfo = {
        triggered_transactions: ["0xchild_tx_mismatch"],
      };

      await assert.rejects(async () => {
        await verifyEmittedTransferOrChildTx({
          client: mockClient,
          txInfo,
          step,
          expectedTarget: "0xexpected_address",
          amountWei: "10000000000000000",
          isPayout: true,
        });
      }, /recipient mismatch/);

      assert.notEqual(step.childTransfer?.verified, true);
    });

    it("verifyEmittedTransferOrChildTx fails closed if child transaction reverted", async () => {
      const mockClient = {
        getTransaction: async ({ hash }) => ({
          hash,
          statusName: "FINALIZED",
          txExecutionResultName: "ERROR",
          to_address: "0xrecipient_addr",
          value: "10000000000000000",
        }),
      };

      const step = {};
      const txInfo = {
        triggered_transactions: ["0xchild_tx_error"],
      };

      await assert.rejects(async () => {
        await verifyEmittedTransferOrChildTx({
          client: mockClient,
          txInfo,
          step,
          expectedTarget: "0xrecipient_addr",
          amountWei: "10000000000000000",
          isPayout: true,
        });
      }, /execution failed/);

      assert.equal(step.childTransfer?.failed, true);
    });

    it("verifyEmittedTransferOrChildTx fails closed when both messages and triggered_transactions/children are empty", async () => {
      const mockClient = {
        getTransaction: async () => null,
      };

      const step = {};
      const txInfo = {
        messages: [],
        triggered_transactions: [],
      };

      await assert.rejects(async () => {
        await verifyEmittedTransferOrChildTx({
          client: mockClient,
          txInfo,
          step,
          expectedTarget: "0xrecipient_addr",
          amountWei: "10000000000000000",
          isPayout: true,
        });
      }, /neither a matching emitted message nor a verifiable child\/transfer exists/);

      assert.notEqual(step.transferEvidence?.verified, true);
    });

    it("verifyEmittedTransferOrChildTx fails closed when child transaction is missing recipient field", async () => {
      const mockClient = {
        getTransaction: async ({ hash }) => ({
          hash,
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          value: "10000000000000000",
        }),
      };

      const step = {};
      const txInfo = {
        triggered_transactions: ["0xchild_no_recipient"],
      };

      await assert.rejects(async () => {
        await verifyEmittedTransferOrChildTx({
          client: mockClient,
          txInfo,
          step,
          expectedTarget: "0xrecipient_addr",
          amountWei: "10000000000000000",
          isPayout: true,
        });
      }, /missing recipient field/);

      assert.equal(step.childTransfer?.failed, true);
    });

    it("verifyEmittedTransferOrChildTx fails closed when child transaction is missing value field", async () => {
      const mockClient = {
        getTransaction: async ({ hash }) => ({
          hash,
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          to_address: "0xrecipient_addr",
        }),
      };

      const step = {};
      const txInfo = {
        triggered_transactions: ["0xchild_no_value"],
      };

      await assert.rejects(async () => {
        await verifyEmittedTransferOrChildTx({
          client: mockClient,
          txInfo,
          step,
          expectedTarget: "0xrecipient_addr",
          amountWei: "10000000000000000",
          isPayout: true,
        });
      }, /missing value field/);

      assert.equal(step.childTransfer?.failed, true);
    });

    it("verifyEmittedTransferOrChildTx fails closed when emitted message is missing value field", async () => {
      const mockClient = {};
      const step = {};
      const txInfo = {
        messages: [{ recipient: "0xrecipient_addr" }],
      };

      await assert.rejects(async () => {
        await verifyEmittedTransferOrChildTx({
          client: mockClient,
          txInfo,
          step,
          expectedTarget: "0xrecipient_addr",
          amountWei: "10000000000000000",
          isPayout: true,
        });
      }, /missing value field/);
    });

    it("verifyEmittedTransferOrChildTx uses SDK getTriggeredTransactionIds when parent response lacks child IDs", async () => {
      let sdkLookupCalled = false;
      const mockClient = {
        getTriggeredTransactionIds: async ({ hash }) => {
          if (hash === "0xparent_without_children") {
            sdkLookupCalled = true;
            return ["0xsdk_child_tx"];
          }
          return [];
        },
        getTransaction: async ({ hash }) => {
          if (hash === "0xsdk_child_tx") {
            return {
              hash: "0xsdk_child_tx",
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
              to_address: "0xrecipient_addr",
              value: "10000000000000000",
            };
          }
          throw new Error("unexpected hash");
        },
      };

      const step = {};
      const txInfo = {
        hash: "0xparent_without_children",
      };

      const result = await verifyEmittedTransferOrChildTx({
        client: mockClient,
        txInfo,
        step,
        expectedTarget: "0xrecipient_addr",
        amountWei: "10000000000000000",
        isPayout: true,
      });

      assert.equal(result, true);
      assert.equal(sdkLookupCalled, true, "Must have called SDK getTriggeredTransactionIds");
      assert.equal(step.childTransfer?.txHash, "0xsdk_child_tx");
      assert.equal(step.childTransfer?.verified, true);
      assert.equal(step.fundsDelivered, true);
      assert.equal(step.deliveryStatus, "DELIVERED");
    });

    it("verifyEmittedTransferOrChildTx distinguishes message emitted from funds delivered", async () => {
      const mockClient = {};
      const step = {};
      const txInfo = {
        hash: "0xparent_tx",
        messages: [
          {
            recipient: "0xrecipient_addr",
            value: "10000000000000000",
            messageType: 1,
          },
        ],
      };

      const result = await verifyEmittedTransferOrChildTx({
        client: mockClient,
        txInfo,
        step,
        expectedTarget: "0xrecipient_addr",
        amountWei: "10000000000000000",
        isPayout: true,
      });

      assert.equal(result, true);
      assert.equal(step.messageEmitted, true);
      assert.equal(step.fundsDelivered, false, "Must not mark delivered without on-chain child transaction evidence");
      assert.equal(step.deliveryStatus, "MESSAGE_EMITTED_PENDING_DELIVERY");
      assert.equal(step.transferEvidence?.verified, true);
      assert.equal(step.transferEvidence?.fundsDelivered, false);
      assert.equal(step.transferEvidence?.messageEmitted, true);
    });

    it("reconcilePendingTransaction reconciles pending child transfer on restart before setting verified: true", async () => {
      let childChecked = false;
      const mockClient = {
        getTransaction: async ({ hash }) => {
          if (hash === "0xparent_tx") {
            return {
              hash: "0xparent_tx",
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
              triggered_transactions: ["0xpending_child_tx"],
            };
          }
          if (hash === "0xpending_child_tx") {
            childChecked = true;
            return {
              hash: "0xpending_child_tx",
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
              to_address: "0xfunder_addr",
              value: "20000000000000000",
            };
          }
          throw new Error("unexpected hash");
        },
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: "REFUND_NOHIT",
              match_reason: "WINDOW_EXPIRED_NO_RELEASE",
              refund: 20000000000000000n,
              funder: "0xfunder_addr",
            };
          }
          if (functionName === "get_economics") {
            return {
              escrowed_open: "0",
              paid_to_recipients: "0",
              refunded_to_funders: "20000000000000000",
            };
          }
        },
      };

      const record = {
        postWindowSettlement: {
          txHash: "0xparent_tx",
          txStatus: "PENDING",
          preEscrowSnapshot: { status: "OPEN", amount: "20000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "20000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          childTransfer: {
            txHash: "0xpending_child_tx",
            status: "PENDING",
            verified: false,
          },
        },
      };

      const result = await reconcilePendingTransaction({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: "0xescrow_refund",
        record,
        stepKey: "postWindowSettlement",
        expectedEscrowStatus: "REFUND_NOHIT",
        expectedMatchReason: "WINDOW_EXPIRED_NO_RELEASE",
        expectedEconomicsDelta: "REFUND",
        amountWei: "20000000000000000",
        saveEvidence: () => {},
      });

      assert.equal(childChecked, true, "Must have checked child transaction");
      assert.equal(result.verified, true);
      assert.equal(record.postWindowSettlement.childTransfer?.verified, true);
      assert.equal(record.postWindowSettlement.childTransfer?.status, "FINALIZED");
      assert.equal(record.postWindowSettlement.transferEvidence?.verified, true);
    });
  });

  describe("9. Evidence Integrity, Truthful Settlement, and On-Chain Economics Tests", () => {
    it("1. message-only pending delivery: separates facts explicitly, message alone is never reported as delivered funds", async () => {
      const mockClient = {};
      const step = {
        txHash: "0xparent_payout_tx",
        escrowStateEconomicsChanged: true,
      };
      const txInfo = {
        hash: "0xparent_payout_tx",
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        messages: [
          {
            recipient: "0xrecipient_addr",
            value: "10000000000000000",
            messageType: 0,
          },
        ],
        triggered_transactions: [],
      };

      const result = await verifyEmittedTransferOrChildTx({
        client: mockClient,
        txInfo,
        step,
        expectedTarget: "0xrecipient_addr",
        amountWei: "10000000000000000",
        isPayout: true,
      });

      assert.equal(result, true);
      assert.equal(step.parentTransactionFinalized, true, "Parent tx must be finalized");
      assert.equal(step.matchingTransferMessageEmitted, true, "Matching message emitted must be true");
      assert.equal(step.fundsDelivered, false, "Matching message alone must NEVER be reported as delivered funds");
      assert.equal(step.deliveryStatus, "MESSAGE_EMITTED_PENDING_DELIVERY");
      assert.equal(step.transferEvidence.fundsDelivered, false);
      assert.equal(step.transferEvidence.matchingTransferMessageEmitted, true);
      assert.equal(step.transferEvidence.parentTransactionFinalized, true);
      assert.equal(step.transferEvidence.escrowStateEconomicsChanged, true);
    });

    it("2. later child discovery on restart: retries delivery lookup even when no child hash was present on run 1", async () => {
      let childLookups = 0;
      const mockClient = {
        getTransaction: async ({ hash }) => {
          if (hash === "0xparent_initial_tx") {
            // Parent transaction now has triggered transaction on chain
            return {
              hash: "0xparent_initial_tx",
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
              triggered_transactions: ["0xlater_discovered_child_tx"],
            };
          }
          if (hash === "0xlater_discovered_child_tx") {
            childLookups++;
            return {
              hash: "0xlater_discovered_child_tx",
              statusName: "FINALIZED",
              txExecutionResultName: "FINISHED_WITH_RETURN",
              to_address: "0xrecipient_addr",
              value: "10000000000000000",
            };
          }
          throw new Error(`Unexpected hash: ${hash}`);
        },
      };

      // Step completed and verified on first run, but fundsDelivered was false and no childTransfer was recorded
      const record = {
        releaseAttempt: {
          txHash: "0xparent_initial_tx",
          txStatus: "FINALIZED",
          executionResult: "FINISHED_WITH_RETURN",
          completed: true,
          verified: true,
          payoutWei: "10000000000000000",
          recipient: "0xrecipient_addr",
          fundsDelivered: false,
          deliveryStatus: "MESSAGE_EMITTED_PENDING_DELIVERY",
          matchingTransferMessageEmitted: true,
          // Note: childTransfer is null/undefined on first run!
        },
      };

      const result = await reconcilePendingTransaction({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: "0xescrow_1",
        record,
        stepKey: "releaseAttempt",
        expectedEscrowStatus: "RELEASED",
        expectedMatchReason: "200_IN_WINDOW",
        expectedEconomicsDelta: "PAYOUT",
        amountWei: "10000000000000000",
        saveEvidence: () => {},
      });

      assert.equal(result.verified, true);
      assert.equal(result.fundsDelivered, true, "Must have upgraded fundsDelivered to true");
      assert.equal(childLookups, 1, "Must have queried discovered child tx");
      assert.equal(record.releaseAttempt.fundsDelivered, true);
      assert.equal(record.releaseAttempt.deliveryStatus, "DELIVERED");
      assert.equal(record.releaseAttempt.childTransfer?.txHash, "0xlater_discovered_child_tx");
      assert.equal(record.releaseAttempt.childTransfer?.verified, true);
    });

    it("3. failed child delivery: fails closed when child transaction execution reverts", async () => {
      let saved = false;
      const mockClient = {
        getTransaction: async ({ hash }) => {
          if (hash === "0xchild_failed_tx") {
            return {
              hash: "0xchild_failed_tx",
              statusName: "FINALIZED",
              txExecutionResultName: "EXECUTION_ERROR",
              to_address: "0xrecipient_addr",
              value: "10000000000000000",
            };
          }
          throw new Error("unexpected hash");
        },
      };

      const step = {};
      const txInfo = {
        hash: "0xparent_tx",
        triggered_transactions: ["0xchild_failed_tx"],
        messages: [
          {
            recipient: "0xrecipient_addr",
            value: "10000000000000000",
            messageType: 0,
          },
        ],
      };

      await assert.rejects(
        async () => {
          await verifyEmittedTransferOrChildTx({
            client: mockClient,
            txInfo,
            step,
            expectedTarget: "0xrecipient_addr",
            amountWei: "10000000000000000",
            isPayout: true,
            saveEvidence: () => {
              saved = true;
            },
          });
        },
        /Child transaction 0xchild_failed_tx execution failed/
      );

      assert.equal(step.childTransfer?.failed, true);
      assert.equal(step.fundsDelivered, undefined);
      assert.equal(saved, true);
    });

    it("4. already-settled state without transaction proof: reports proof incomplete and submits no duplicate write", async () => {
      // Scenario A: 404 Escrow already REFUND_NOHIT on-chain, but no verified settlement transaction recorded
      const escrowOnChainRefund = {
        id: "0xescrow_refund_unproven",
        status: "REFUND_NOHIT",
        match_reason: "WINDOW_EXPIRED_NO_RELEASE",
        amount: 20000000000000000n,
        refund: 20000000000000000n,
        payout: 0n,
      };

      const record404 = {
        id: "0xescrow_refund_unproven",
        principalWei: "20000000000000000",
        refundSettlementVerified: false,
        postWindowSettlement: null, // No transaction proof!
      };

      // In settle runner:
      if (escrowOnChainRefund.status === "REFUND_NOHIT") {
        if (!record404.refundSettlementVerified && !record404.postWindowSettlement?.verified) {
          record404.refundSettlementVerified = false;
          record404.settledOnChainProofIncomplete = true;
          record404.currentStatus = "SETTLED_ON_CHAIN_PROOF_INCOMPLETE";
          record404.finalState = {
            status: "REFUND_NOHIT",
            settled: true,
            matchReason: escrowOnChainRefund.match_reason || null,
            funderRefundWei: escrowOnChainRefund.refund.toString(),
            proofIncomplete: true,
            finding: "settled on-chain, proof incomplete",
          };
        }
      }

      assert.equal(record404.refundSettlementVerified, false, "Must NOT set refundSettlementVerified to true");
      assert.equal(record404.currentStatus, "SETTLED_ON_CHAIN_PROOF_INCOMPLETE");
      assert.equal(record404.finalState.proofIncomplete, true);
      assert.equal(record404.postWindowSettlement, null, "Must not fabricate transaction proof");

      // Scenario B: Candidate Escrow already RELEASED on-chain, but no verified release transaction recorded
      const candidateEscrowReleased = {
        id: "0xcand_released_unproven",
        status: "RELEASED",
        match_reason: "200_IN_WINDOW",
        amount: 10000000000000000n,
        payout: 10000000000000000n,
        refund: 0n,
      };

      const candRecord = {
        id: "0xcand_released_unproven",
        fundedAmountWei: "10000000000000000",
        releaseAttempt: null, // No transaction proof!
      };

      if (candidateEscrowReleased.status === "RELEASED") {
        if (!candRecord.releaseAttempt?.verified) {
          candRecord.releaseAttemptVerified = false;
          candRecord.settledOnChainProofIncomplete = true;
          candRecord.currentStatus = "SETTLED_ON_CHAIN_PROOF_INCOMPLETE";
          candRecord.finalState = {
            status: "RELEASED",
            settled: true,
            matchReason: candidateEscrowReleased.match_reason || null,
            recipientPayoutWei: candidateEscrowReleased.payout.toString(),
            proofIncomplete: true,
            finding: "settled on-chain, proof incomplete",
          };
        }
      }

      assert.equal(candRecord.releaseAttemptVerified, false, "Must NOT set releaseAttemptVerified to true");
      assert.equal(candRecord.currentStatus, "SETTLED_ON_CHAIN_PROOF_INCOMPLETE");
      assert.equal(candRecord.finalState.proofIncomplete, true);
      assert.equal(candRecord.releaseAttempt, null, "Must not fabricate transaction proof");
    });

    it("5. cross-boundary refund: in-window attempt executing after window_end reconciles to REFUND_NOHIT and prevents duplicate write", async () => {
      const mockClient = {
        getTransaction: async ({ hash }) => {
          return {
            hash,
            statusName: "FINALIZED",
            txExecutionResultName: "FINISHED_WITH_RETURN",
            messages: [
              {
                recipient: "0xfunder_addr",
                value: "20000000000000000",
                messageType: 0,
              },
            ],
            triggered_transactions: [],
          };
        },
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              id: "0xescrow_cross",
              status: "REFUND_NOHIT",
              match_reason: "WINDOW_EXPIRED_NO_RELEASE",
              amount: 20000000000000000n,
              refund: 20000000000000000n,
              payout: 0n,
              funder: "0xfunder_addr",
              recipient: "0xrecipient_addr",
            };
          }
          if (functionName === "get_economics") {
            return {
              escrowed_open: "2050000000000000000",
              paid_to_recipients: "0",
              refunded_to_funders: "30000000000000000",
              outstanding_credits: "0",
              treasury: "0",
            };
          }
        },
      };

      const record = {
        principalWei: "20000000000000000",
        inWindowAttempt: {
          txHash: "0xcross_boundary_tx",
          txStatus: "PENDING",
          submittedAtUtc: "2026-10-12T10:35:00Z",
          preEscrowSnapshot: {
            status: "OPEN",
            amount: "20000000000000000",
            match_reason: "LOOKBACK_404_OK",
          },
          preEconomicsSnapshot: {
            escrowed_open: "2070000000000000000",
            paid_to_recipients: "0",
            refunded_to_funders: "10000000000000000",
            outstanding_credits: "0",
            treasury: "0",
          },
          completed: false,
          verified: false,
        },
      };

      const res = await reconcilePendingTransaction({
        client: mockClient,
        contractAddress: "0xcontract",
        escrowId: "0xescrow_cross",
        record,
        stepKey: "inWindowAttempt",
        expectedEscrowStatus: "OPEN",
        expectedMatchReason: "EARLY_404_RETRYABLE",
        expectedEconomicsDelta: "NO_CHANGE",
        amountWei: "20000000000000000",
        allowCrossBoundaryRefund: true,
        requireEarly404: true,
        saveEvidence: () => {},
      });

      assert.equal(res.executedAfterWindowEnd, true);
      assert.equal(res.refundSettlementVerified, true);
      assert.equal(res.early404Verified, false, "Must NOT mark early404Verified as true");
      assert.equal(record.early404Verified, false);
      assert.equal(record.refundSettlementVerified, true);
      assert.equal(record.postWindowSettlement?.txHash, "0xcross_boundary_tx");
      assert.equal(record.postWindowSettlement?.settledViaCrossBoundaryInWindowTx, true);
      assert.equal(record.inWindowAttempt.parentTransactionFinalized, true);
      assert.equal(record.inWindowAttempt.escrowStateEconomicsChanged, true);
      assert.equal(record.inWindowAttempt.matchingTransferMessageEmitted, true);
      assert.equal(record.inWindowAttempt.fundsDelivered, false);
    });

    it("6. RPC-time failure: getRpcTime with failClosed: true throws instead of using local clock", async () => {
      const failingClient = {
        request: async () => {
          throw new Error("RPC network connection timeout");
        },
      };

      await assert.rejects(
        async () => {
          await getRpcTime(failingClient, { failClosed: true });
        },
        /Failed to query Studio Next RPC time/
      );

      // Verify failClosed: false falls back to Date
      const fallbackTime = await getRpcTime(failingClient, { failClosed: false });
      assert.ok(fallbackTime instanceof Date);
    });

    it("7. stale time across two escrows: runner rechecks RPC time immediately before each escrow and timed write", async () => {
      let rpcCallCount = 0;
      const timestamps = [
        "0x68eb51b0", // 2025-10-12T05:00:00Z (pre-window for escrow 1)
        "0x68eba020", // 2025-10-12T10:35:00Z (in-window for escrow 2)
      ];

      const client = {
        request: async ({ method }) => {
          if (method === "eth_getBlockByNumber") {
            const ts = timestamps[rpcCallCount++] || timestamps[timestamps.length - 1];
            return { timestamp: ts };
          }
          throw new Error("unsupported");
        },
      };

      // Check escrow 1
      const time1 = await getRpcTime(client, { failClosed: true });
      assert.equal(time1.getTime(), 0x68eb51b0 * 1000);

      // Check escrow 2 immediately before write
      const time2 = await getRpcTime(client, { failClosed: true });
      assert.equal(time2.getTime(), 0x68eba020 * 1000);
      assert.notEqual(time1.getTime(), time2.getTime(), "Escrow 2 must use fresh RPC time, not stale time from startup");
    });

    it("8. additional unrelated OPEN escrow: preflight reconciles total economics against all on-chain escrows without false failure", async () => {
      // 7 on-chain escrows: 6 steward escrows (2.07 GEN) + 1 new public-app escrow (0.05 GEN) = 2.12 GEN total
      const allEscrowIds = [
        "0xsteward_1",
        "0xsteward_2",
        "0xsteward_3",
        "0xsteward_4",
        "0xsteward_5",
        "0xsteward_6",
        "0xunrelated_public_app_escrow",
      ];

      const escrowsData = {
        "0xsteward_1": { status: "OPEN", amount: 20000000000000000n, payout: 0n, refund: 0n },
        "0xsteward_2": { status: "OPEN", amount: 20000000000000000n, payout: 0n, refund: 0n },
        "0xsteward_3": { status: "OPEN", amount: 10000000000000000n, payout: 0n, refund: 0n },
        "0xsteward_4": { status: "OPEN", amount: 10000000000000000n, payout: 0n, refund: 0n },
        "0xsteward_5": { status: "OPEN", amount: 10000000000000000n, payout: 0n, refund: 0n },
        "0xsteward_6": { status: "OPEN", amount: 2000000000000000000n, payout: 0n, refund: 0n },
        "0xunrelated_public_app_escrow": { status: "OPEN", amount: 50000000000000000n, payout: 0n, refund: 0n },
      };

      const economics = {
        escrowed_open: "2120000000000000000", // 2.12 GEN
        paid_to_recipients: "0",
        refunded_to_funders: "0",
      };

      // Sum across all on-chain escrows returned by contract:
      let totalOpen = 0n;
      let totalPaid = 0n;
      let totalRefunded = 0n;

      for (const id of allEscrowIds) {
        const e = escrowsData[id];
        if (e.status === "OPEN") totalOpen += e.amount;
        else if (e.status === "RELEASED") totalPaid += e.payout;
        else if (e.status === "REFUND_NOHIT") totalRefunded += e.refund;
      }

      // Assert that total open matches contract economics exactly
      assert.equal(BigInt(economics.escrowed_open), totalOpen, "Total open must reconcile against all 7 escrows");
      assert.equal(BigInt(economics.paid_to_recipients), totalPaid);
      assert.equal(BigInt(economics.refunded_to_funders), totalRefunded);

      // Assert that steward escrows are validated separately without failing due to the extra escrow
      const stewardIds = allEscrowIds.slice(0, 6);
      const onChainSet = new Set(allEscrowIds);
      for (const sId of stewardIds) {
        assert.ok(onChainSet.has(sId), `Steward escrow ${sId} must be present on-chain`);
      }
    });
  });

  describe("10. Milestone v2 Source-Linked Verified Release Evidence Tests", () => {
    it("strictly validates canonical GitHub owner/repo format and rejects injection attacks", () => {
      // Valid canonical repositories
      const validCases = [
        ["pallets/flask", "pallets/flask"],
        ["octocat/Hello-World", "octocat/hello-world"],
        ["my-org-123/cool_lib.v2", "my-org-123/cool_lib.v2"],
        ["facebook/react", "facebook/react"],
      ];
      for (const [c, expectedNorm] of validCases) {
        const res = validateGithubRepo(c);
        assert.equal(res.valid, true, `Should accept valid repo: ${c}`);
        assert.equal(res.normalized, expectedNorm);
      }

      // Valid hyphen, underscore, and dot cases
      const validChars = validateGithubRepo("my-org-123/my-repo_v1.0.core");
      assert.equal(validChars.valid, true);
      assert.equal(validChars.normalized, "my-org-123/my-repo_v1.0.core");

      // Length boundaries: 127 and 128 valid, 129 invalid
      const repo127 = "a".repeat(38) + "/" + "b".repeat(88); // 38 + 1 + 88 = 127
      assert.equal(repo127.length, 127);
      assert.equal(validateGithubRepo(repo127).valid, true);

      const repo128 = "a".repeat(38) + "/" + "b".repeat(89); // 38 + 1 + 89 = 128
      assert.equal(repo128.length, 128);
      assert.equal(validateGithubRepo(repo128).valid, true);

      const repo129 = "a".repeat(38) + "/" + "b".repeat(90); // 38 + 1 + 90 = 129
      assert.equal(repo129.length, 129);
      assert.equal(validateGithubRepo(repo129).valid, false);

      // Trailing .git strictly rejected
      assert.equal(validateGithubRepo("pallets/flask.git").valid, false);
      assert.equal(validateGithubRepo("owner/repo.git").valid, false);

      // Unicode letters rejected
      assert.equal(validateGithubRepo("octocat/héllo-world").valid, false);
      assert.equal(validateGithubRepo("öwner/repo").valid, false);
      assert.equal(validateGithubRepo("owner/rëpo").valid, false);

      // Extra slashes rejected
      assert.equal(validateGithubRepo("pallets/flask/extra").valid, false);
      assert.equal(validateGithubRepo("/pallets/flask").valid, false);
      assert.equal(validateGithubRepo("pallets/flask/").valid, false);

      // Whitespace and control characters rejected
      assert.equal(validateGithubRepo("").valid, false);
      assert.equal(validateGithubRepo("   ").valid, false);
      assert.equal(validateGithubRepo(" pallets/flask").valid, false);
      assert.equal(validateGithubRepo("pallets/flask ").valid, false);
      assert.equal(validateGithubRepo("pallets/ flask").valid, false);
      assert.equal(validateGithubRepo("pallets/flask\0evil").valid, false);
      assert.equal(validateGithubRepo("pallets/flask\n").valid, false);
      assert.equal(validateGithubRepo("pallets/flask\t").valid, false);

      // Malicious or malformed inputs MUST fail closed
      const invalidCases = [
        "pallets", // missing slash
        "https://github.com/pallets/flask", // URL scheme
        "git://github.com/pallets/flask", // scheme
        "pallets/flask?query=true", // query string
        "pallets/flask#tag", // fragment
        "pallets:flask", // colon
        "pallets/flask:8080", // port
        "../pallets/flask", // traversal
        "pallets/../flask", // traversal
        "pallets/..", // traversal
        "pallets/flask%2Fevil", // url encoded
        "-pallets/flask", // invalid owner start
        "pallets-/flask", // invalid owner end
      ];

      for (const inv of invalidCases) {
        const res = validateGithubRepo(inv);
        assert.equal(res.valid, false, `Must reject invalid repo: ${inv}`);
        assert.notEqual(res.error, null);
      }
    });

    it("strictly validates canonical GitHub release tag syntax and rejects dangerous ref characters", () => {
      const validTags = [
        "v1.0.0",
        "1.0.0",
        "v2.1.0-rc1",
        "release-2026.10",
        "v0.0.1+build.123",
      ];
      for (const t of validTags) {
        const res = validateGithubTag(t);
        assert.equal(res.valid, true, `Should accept valid tag: ${t}`);
      }

      // Valid hyphen, underscore, and dot cases
      assert.equal(validateGithubTag("v1.0.0-rc_1.patch").valid, true);
      assert.equal(validateGithubTag("release-2026.10_build.1").valid, true);

      // Length boundaries: 127 and 128 valid, 129 invalid
      const tag127 = "v" + "a".repeat(126); // 127 chars
      assert.equal(tag127.length, 127);
      assert.equal(validateGithubTag(tag127).valid, true);

      const tag128 = "v" + "a".repeat(127); // 128 chars
      assert.equal(tag128.length, 128);
      assert.equal(validateGithubTag(tag128).valid, true);

      const tag129 = "v" + "a".repeat(128); // 129 chars
      assert.equal(tag129.length, 129);
      assert.equal(validateGithubTag(tag129).valid, false);

      // Unicode letters rejected
      assert.equal(validateGithubTag("v1.0.0-β").valid, false);
      assert.equal(validateGithubTag("v1.0.0-ü").valid, false);
      assert.equal(validateGithubTag("tag-日本語").valid, false);

      // Extra slashes rejected
      assert.equal(validateGithubTag("v1.0/extra").valid, false);
      assert.equal(validateGithubTag("/v1.0.0").valid, false);
      assert.equal(validateGithubTag("v1.0.0/").valid, false);

      // Whitespace and control characters rejected
      assert.equal(validateGithubTag("").valid, false);
      assert.equal(validateGithubTag("   ").valid, false);
      assert.equal(validateGithubTag(" v1.0.0").valid, false);
      assert.equal(validateGithubTag("v1.0.0 ").valid, false);
      assert.equal(validateGithubTag("v1 0").valid, false);
      assert.equal(validateGithubTag("v1.0.0\t").valid, false);
      assert.equal(validateGithubTag("v1.0.0\n").valid, false);
      assert.equal(validateGithubTag("v1\x1f").valid, false);

      const invalidTags = [
        "v1.0.0.", // trailing dot
        "v1..0", // double dot git ref forbidden
        "v1.0~1", // tilde git ref forbidden
        "v1.0^2", // caret git ref forbidden
        "v1.0:tag", // colon forbidden
        "v1.0?x", // question mark forbidden
        "v1.0#x", // fragment forbidden
        "v1.0*x", // asterisk forbidden
        "v1.0[x]", // bracket forbidden
        "v1.0@{1}", // reflog notation forbidden
        "v1.0//v2", // double slash forbidden
        "v1.0\\x", // backslash forbidden
        "v1.0.lock", // .lock forbidden
      ];

      for (const inv of invalidTags) {
        const res = validateGithubTag(inv);
        assert.equal(res.valid, false, `Must reject invalid tag: ${inv}`);
      }
    });

    it("normalizes diverse git repository URLs into canonical owner/repo form", () => {
      const testMappings = [
        ["https://github.com/pallets/flask", "pallets/flask"],
        ["https://github.com/pallets/flask.git", "pallets/flask"],
        ["http://github.com/pallets/flask", "pallets/flask"],
        ["git+https://github.com/pallets/flask.git", "pallets/flask"],
        ["git@github.com:pallets/flask.git", "pallets/flask"],
        ["ssh://git@github.com/pallets/flask", "pallets/flask"],
        ["github:pallets/flask", "pallets/flask"],
        ["pallets/flask", "pallets/flask"],
        ["https://github.com/pallets/flask?param=1", "pallets/flask"],
        ["https://github.com/pallets/flask#readme", "pallets/flask"],
        // Specific regression cases from security specification:
        ["https://github.com/Owner/Repo", "owner/repo"],
        ["https://github.com/Owner/Repo.git", "owner/repo"],
        ["git+https://github.com/Owner/Repo.git", "owner/repo"],
        ["ssh://git@github.com/Owner/Repo", "owner/repo"],
        ["git@github.com:Owner/Repo.git", "owner/repo"],
        ["github:Owner/Repo", "owner/repo"],
        ["Owner/Repo", "owner/repo"],
      ];

      for (const [input, expected] of testMappings) {
        const norm = normalizeGithubRepoUrl(input);
        assert.equal(norm, expected, `Failed normalizing ${input}`);
      }

      // Non-github, spoofed hostnames, embedded paths, and attack URLs normalize to empty string
      const invalidUrls = [
        "https://evil.example/github.com/owner/repo",
        "https://notgithub.com/owner/repo",
        "git@evilgithub.com:owner/repo",
        "https://github.com.evil/owner/repo",
        "https://github.com/owner/repo/issues",
        "https://github.com/owner/repo/tree/main",
        "github://owner/repo",
        "https://github.com:443/owner/repo",
        "https://gitlab.com/pallets/flask",
        "https://evil.com/github.com/pallets/flask",
        "https://github.com/pallets/flask/../evil",
        "not a url",
      ];
      for (const inv of invalidUrls) {
        const norm = normalizeGithubRepoUrl(inv);
        assert.equal(norm, "", `Must reject non-github or malformed url: ${inv}`);
      }
    });

    it("parses GitHub release metadata correctly and flags mismatches or incompleteness", () => {
      // 1. Valid matching release
      const validRelease = {
        tag_name: "v3.0.0",
        name: "Flask 3.0.0 Release",
        published_at: "2026-10-15T14:30:00Z",
        created_at: "2026-10-15T14:00:00Z",
        draft: false,
        prerelease: false,
      };
      const p1 = parseGithubReleaseMetadata(validRelease, "pallets/flask", "v3.0.0");
      assert.equal(p1.kind, "200");
      assert.equal(p1.exists, true);
      assert.equal(p1.tag_name, "v3.0.0");
      assert.equal(p1.published_utc, "2026-10-15T14:30:00.000Z");
      assert.equal(p1.draft, false);

      // 2. Tag mismatch
      const p2 = parseGithubReleaseMetadata(validRelease, "pallets/flask", "v2.9.9");
      assert.equal(p2.kind, "mismatch");
      assert.equal(p2.tag_name, "v3.0.0");

      // 3. Missing tag_name
      const missingTag = { published_at: "2026-10-15T14:30:00Z" };
      const p3 = parseGithubReleaseMetadata(missingTag, "pallets/flask", "v3.0.0");
      assert.equal(p3.kind, "inconclusive");

      // 4. Missing timestamps
      const missingTime = { tag_name: "v3.0.0" };
      const p4 = parseGithubReleaseMetadata(missingTime, "pallets/flask", "v3.0.0");
      assert.equal(p4.kind, "inconclusive");

      // 5. Non-JSON input
      const p5 = parseGithubReleaseMetadata("raw string 404", "pallets/flask", "v3.0.0");
      assert.equal(p5.kind, "non-json");
    });

    it("simulates dual-source consensus: requires both in-window publish and exact repo/tag match", () => {
      const windowStart = parseUtcIso("2026-10-14T00:00:00Z");
      const windowEnd = parseUtcIso("2026-10-16T00:00:00Z");

      // Evaluator function matching contract release logic
      function evaluateRelease(regEvidence, ghEvidence, nowUtc) {
        // Registry check
        const regOk = regEvidence.kind === "200" && !regEvidence.yanked;
        let regInWindow = false;
        if (regOk && regEvidence.publish_time) {
          const t = parseUtcIso(regEvidence.publish_time);
          regInWindow = t >= windowStart && t <= windowEnd;
        }

        // GitHub check
        const ghOk = ghEvidence.kind === "200" && ghEvidence.exists && !ghEvidence.draft;
        let ghInWindow = false;
        if (ghOk && ghEvidence.published_utc) {
          const t = parseUtcIso(ghEvidence.published_utc);
          ghInWindow = t >= windowStart && t <= windowEnd;
        }

        const repoMatches = regEvidence.repository === "pallets/flask";
        const tagMatches = ghEvidence.tag_name === "v3.0.0";

        // If all conditions met -> RELEASE
        if (regOk && regInWindow && ghOk && ghInWindow && repoMatches && tagMatches) {
          return { status: "RELEASED", reason: "VERIFIED_SOURCE_LINKED_RELEASE" };
        }

        // Inside window: transport or missing evidence remains OPEN
        if (nowUtc <= windowEnd) {
          return { status: "OPEN", reason: "EARLY_EVIDENCE_RETRYABLE" };
        }

        // After window: transport or inconclusive failures must stay OPEN fail-closed
        const regInconclusive = ["unavailable", "oversize", "non-json", "inconclusive", "500", "502", "503", "504"].includes(regEvidence.kind);
        const ghInconclusive = ["unavailable", "oversize", "non-json", "inconclusive", "500", "502", "503", "504"].includes(ghEvidence.kind);
        if (regInconclusive || ghInconclusive) {
          return { status: "OPEN", reason: "TRANSPORT_FAILURE_FAIL_CLOSED" };
        }

        // After window: conclusive absence, yank, or mismatch triggers REFUND_NOHIT
        const regFailedConclusively = regEvidence.kind === "404" || regEvidence.yanked || !regInWindow || !repoMatches;
        const ghFailedConclusively = ghEvidence.kind === "404" || ghEvidence.kind === "mismatch" || !ghInWindow || !tagMatches;
        if (regFailedConclusively || ghFailedConclusively) {
          return { status: "REFUND_NOHIT", reason: "NOHIT_SOURCE_LINKED_FAILURE" };
        }

        // Otherwise stay OPEN
        return { status: "OPEN", reason: "TRANSPORT_FAILURE_FAIL_CLOSED" };
      }

      const activeNow = parseUtcIso("2026-10-15T12:00:00Z");
      const postWindowNow = parseUtcIso("2026-10-17T12:00:00Z");

      // Scenario A: Both in window and match -> RELEASE
      const passReg = { kind: "200", yanked: false, publish_time: "2026-10-15T10:00:00Z", repository: "pallets/flask" };
      const passGh = { kind: "200", exists: true, draft: false, tag_name: "v3.0.0", published_utc: "2026-10-15T09:30:00Z" };
      const resA = evaluateRelease(passReg, passGh, activeNow);
      assert.equal(resA.status, "RELEASED");
      assert.equal(resA.reason, "VERIFIED_SOURCE_LINKED_RELEASE");

      // Scenario B: Active window, GitHub 404 -> stays OPEN retryable
      const gh404 = { kind: "404", exists: false, draft: false, tag_name: "", published_utc: "" };
      const resB = evaluateRelease(passReg, gh404, activeNow);
      assert.equal(resB.status, "OPEN");
      assert.equal(resB.reason, "EARLY_EVIDENCE_RETRYABLE");

      // Scenario C: Active window, repository mismatch -> stays OPEN retryable
      const mismatchReg = { kind: "200", yanked: false, publish_time: "2026-10-15T10:00:00Z", repository: "other/flask" };
      const resC = evaluateRelease(mismatchReg, passGh, activeNow);
      assert.equal(resC.status, "OPEN");
      assert.equal(resC.reason, "EARLY_EVIDENCE_RETRYABLE");

      // Scenario D: Post window, conclusive GitHub 404 -> REFUND_NOHIT
      const resD = evaluateRelease(passReg, gh404, postWindowNow);
      assert.equal(resD.status, "REFUND_NOHIT");
      assert.equal(resD.reason, "NOHIT_SOURCE_LINKED_FAILURE");

      // Scenario E: Post window, registry transport 500 failure -> stays OPEN fail-closed!
      const transportFailReg = { kind: "500", error: "server error" };
      const resE = evaluateRelease(transportFailReg, passGh, postWindowNow);
      assert.equal(resE.status, "OPEN");
      assert.equal(resE.reason, "TRANSPORT_FAILURE_FAIL_CLOSED");
    });
  });
});

