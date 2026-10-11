/**
 * test_evidence_harness.mjs
 *
 * Focused unit tests for ShipLock steward evidence harness:
 * 1. Failed execution handling (reverted transaction fails closed)
 * 2. Pending transaction recovery (reconciles without resubmitting)
 * 3. Wrong escrow state detection (aborts on mismatched on-chain data)
 * 4. Atomic evidence recording & economics delta validation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  atomicWriteJson,
  readJsonSafe,
  executeWithPendingRecovery,
  verifyEconomicsDelta,
} from "../scripts/evidence_helper.mjs";

describe("ShipLock Steward Evidence Harness Tests", () => {
  describe("1. Failed Execution Handling", () => {
    it("fails closed when transaction reverts or returns error result", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "EXECUTION_REVERTED",
        }),
        waitForTransactionReceipt: async () => {},
      };

      const record = {};
      let saveCalled = false;
      const saveEvidence = () => { saveCalled = true; };

      await assert.rejects(
        async () => {
          await executeWithPendingRecovery({
            client: mockClient,
            record,
            stepKey: "testStep",
            saveEvidence,
            submitFn: async () => "0xfailedtx123",
          });
        },
        /Transaction execution failed closed|REVERTED/
      );

      assert.equal(record.testStep.failed, true);
      assert.equal(record.testStep.txStatus, "FINALIZED");
      assert.equal(record.testStep.executionResult, "EXECUTION_REVERTED");
      assert.equal(saveCalled, true);
    });

    it("fails closed when transaction status is not FINALIZED", async () => {
      const mockClient = {
        getTransaction: async () => ({
          statusName: "UNKNOWN_STATUS",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        waitForTransactionReceipt: async () => {},
      };

      const record = {};
      const saveEvidence = () => {};

      await assert.rejects(
        async () => {
          await executeWithPendingRecovery({
            client: mockClient,
            record,
            stepKey: "testStep",
            saveEvidence,
            submitFn: async () => "0xunknown123",
          });
        },
        /Transaction execution failed closed/
      );

      assert.equal(record.testStep.failed, true);
    });
  });

  describe("2. Pending Transaction Recovery", () => {
    it("reconciles existing finalized transaction without resubmitting a new one", async () => {
      let submitCalled = false;
      const existingTxHash = "0xpreviously_submitted_tx";

      const mockClient = {
        getTransaction: async ({ hash }) => {
          assert.equal(hash, existingTxHash);
          return {
            statusName: "FINALIZED",
            txExecutionResultName: "FINISHED_WITH_RETURN",
          };
        },
        waitForTransactionReceipt: async () => {
          assert.fail("Should not wait when transaction was already finalized!");
        },
      };

      const record = {
        testStep: {
          txHash: existingTxHash,
          txStatus: "PENDING",
        },
      };

      let saveCount = 0;
      const saveEvidence = () => { saveCount++; };

      const result = await executeWithPendingRecovery({
        client: mockClient,
        record,
        stepKey: "testStep",
        saveEvidence,
        submitFn: async () => {
          submitCalled = true;
          return "0xnew_tx";
        },
      });

      assert.equal(submitCalled, false, "Must NEVER submit a new tx when pending hash exists and is finalized!");
      assert.equal(result.txHash, existingTxHash);
      assert.equal(record.testStep.reconciledFromPending, true);
      assert.equal(record.testStep.txStatus, "FINALIZED");
      assert.equal(record.testStep.executionResult, "FINISHED_WITH_RETURN");
      assert(saveCount > 0);
    });

    it("persists submitted hash immediately before waiting for receipt", async () => {
      const newTxHash = "0xbrand_new_hash_999";
      let receiptWaitStarted = false;
      let hashPersistedBeforeReceipt = false;

      const record = {};
      const saveEvidence = () => {
        if (!receiptWaitStarted && record.testStep?.txHash === newTxHash) {
          hashPersistedBeforeReceipt = true;
        }
      };

      const mockClient = {
        getTransaction: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
        waitForTransactionReceipt: async () => {
          receiptWaitStarted = true;
        },
      };

      await executeWithPendingRecovery({
        client: mockClient,
        record,
        stepKey: "testStep",
        saveEvidence,
        submitFn: async () => newTxHash,
      });

      assert.equal(hashPersistedBeforeReceipt, true, "Hash MUST be persisted BEFORE waitForTransactionReceipt is called!");
    });
  });

  describe("3. Wrong Escrow State & Economics Validation", () => {
    it("verifyEconomicsDelta accepts correct PAYOUT delta", () => {
      const econBefore = {
        escrowed_open: "20000000000000000",
        paid_to_recipients: "0",
        refunded_to_funders: "0",
      };
      const econAfter = {
        escrowed_open: "10000000000000000",
        paid_to_recipients: "10000000000000000",
        refunded_to_funders: "0",
      };
      assert.doesNotThrow(() => {
        verifyEconomicsDelta({
          econBefore,
          econAfter,
          expectedType: "PAYOUT",
          amountWei: "10000000000000000",
        });
      });
    });

    it("verifyEconomicsDelta rejects mismatched PAYOUT delta", () => {
      const econBefore = {
        escrowed_open: "20000000000000000",
        paid_to_recipients: "0",
        refunded_to_funders: "0",
      };
      const econAfter = {
        escrowed_open: "20000000000000000", // Failed to decrease
        paid_to_recipients: "10000000000000000",
        refunded_to_funders: "0",
      };
      assert.throws(() => {
        verifyEconomicsDelta({
          econBefore,
          econAfter,
          expectedType: "PAYOUT",
          amountWei: "10000000000000000",
        });
      }, /Economics mismatch/);
    });

    it("verifyEconomicsDelta rejects unintended changes during NO_CHANGE check", () => {
      const econBefore = {
        escrowed_open: "20000000000000000",
        paid_to_recipients: "0",
        refunded_to_funders: "0",
      };
      const econAfter = {
        escrowed_open: "10000000000000000", // Unexpected reduction
        paid_to_recipients: "0",
        refunded_to_funders: "0",
      };
      assert.throws(() => {
        verifyEconomicsDelta({
          econBefore,
          econAfter,
          expectedType: "NO_CHANGE",
          amountWei: "10000000000000000",
        });
      }, /Economics mismatch/);
    });
  });

  describe("4. Atomic Evidence Recording", () => {
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

        // Overwrite atomically
        const payload2 = { ...payload, updated: true };
        atomicWriteJson(testFile, payload2);
        const readBack2 = readJsonSafe(testFile);
        assert.equal(readBack2.updated, true);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
