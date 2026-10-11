import fs from "node:fs";
import path from "node:path";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Ensure .env.local values are loaded in test environment
try {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [k, ...v] = trimmed.split("=");
        if (!process.env[k]) {
          process.env[k] = v.join("=");
        }
      }
    }
  }
} catch {
  // ignore
}

import { 
  deriveEscrowId, 
  generateEscrowNonce, 
  normalizeIsoUtc 
} from "../src/lib/escrow";
import { 
  CONTRACT_ADDRESS, 
  IS_CONTRACT_ADDRESS_VALID, 
  getValidatedContractAddress 
} from "../src/lib/env";
import { 
  writeIc, 
  verifyCreatedEscrow, 
  assertAddress,
  isTemporaryNetworkOrTransportError,
  validatePhaseAllocations,
  MIN_PHASE_TIMEOUT,
  MAX_PHASE_TIMEOUT
} from "../src/lib/write";

const validDistribution = {
  leaderTimeunitsAllocation: 200n,
  validatorTimeunitsAllocation: 400n,
};
import { 
  pollActionOutcome 
} from "../src/lib/action";

describe("ShipLock Phase 2 - Production Contract Integration & Runtime Flow", () => {

  describe("1. Contract Address & Single Endpoint Enforcement", () => {
    test("CONTRACT_ADDRESS is valid and matches 20-byte hex format", () => {
      assert.equal(IS_CONTRACT_ADDRESS_VALID, true);
      assert.match(CONTRACT_ADDRESS, /^0x[0-9a-fA-F]{40}$/);
      assert.equal(getValidatedContractAddress(), CONTRACT_ADDRESS);
    });

    test("assertAddress validates 20-byte addresses and rejects invalid formats", () => {
      assert.equal(
        assertAddress(CONTRACT_ADDRESS, "contract"),
        CONTRACT_ADDRESS
      );
      assert.throws(() => assertAddress("", "contract"), /missing/);
      assert.throws(() => assertAddress(undefined, "contract"), /missing/);
      assert.throws(() => assertAddress("0xinvalid", "contract"), /invalid/);
      assert.throws(() => assertAddress("0x123456789012345678901234567890123456789", "contract"), /invalid/);
    });
  });

  describe("2. Nonce Generation & Deterministic Escrow ID Derivation", () => {
    test("generateEscrowNonce produces unique non-zero unsigned 256-bit bigints", () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const nonce = generateEscrowNonce();
        assert.equal(typeof nonce, "bigint");
        assert.ok(nonce > 0n, "nonce must be positive unsigned bigint");
        nonces.add(nonce.toString());
      }
      assert.equal(nonces.size, 50, "all generated nonces must be strictly unique");
    });

    test("normalizeIsoUtc canonicalizes timestamps without milliseconds", () => {
      assert.equal(normalizeIsoUtc("2026-10-15T00:00:00.000Z"), "2026-10-15T00:00:00Z");
      assert.equal(normalizeIsoUtc("2026-10-15T12:30:45Z"), "2026-10-15T12:30:45Z");
      assert.throws(() => normalizeIsoUtc("not-a-date"), /Invalid date string/);
    });

    test("deriveEscrowId strictly matches Python sha256 preimage specification", () => {
      const inputs = {
        funder: "0x1111111111111111111111111111111111111111",
        recipient: "0x2222222222222222222222222222222222222222",
        template: "PYPI_VERSION",
        packageName: "requests",
        version: "3.0.0",
        windowStartUtc: "2026-10-15T00:00:00Z",
        windowEndUtc: "2026-10-17T00:00:00Z",
        amountWei: 1000000000000000000n,
        nonce: 123456789n,
      };

      const escrowId = deriveEscrowId(inputs);
      assert.match(escrowId, /^0x[0-9a-f]{64}$/);

      const escrowIdDiffNonce = deriveEscrowId({ ...inputs, nonce: 123456790n });
      assert.notEqual(escrowId, escrowIdDiffNonce);

      const escrowIdUpper = deriveEscrowId({
        ...inputs,
        funder: inputs.funder.toUpperCase(),
        recipient: inputs.recipient.toUpperCase(),
      });
      assert.equal(escrowId, escrowIdUpper, "derivation must be normalized lowercase for addresses");
    });
  });

  describe("3. writeIc BigInt Logging, Fee Policy Verification, & Execution Evidence", () => {
    const funder = "0x1111111111111111111111111111111111111111";
    const recipient = "0x2222222222222222222222222222222222222222";
    const bigintNonce = 987654321012345678901234567890n;
    const amountWei = 2500000000000000000n;

    const mockProvider = {
      request: async ({ method }: any) => {
        if (method === "eth_chainId") return "0xf22d"; // 61997
        return null;
      }
    };

    test("writeIc safely serializes BigInt arguments in preWriteLog and reaches writeContract without throwing", async () => {
      let writeContractCalled = false;
      let capturedParams: any = null;

      const mockClient = {
        account: funder,
        writeContract: async (params: any) => {
          writeContractCalled = true;
          capturedParams = params;
          return "0xtx_fund_bigint_123";
        },
        getTransaction: async () => ({
          status: "FINALIZED",
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          result: 0,
        }),
      };

      // Injected Transaction Kit isolates test from real Studio RPC
      const mockKit = {
        estimate: async () => ({
          distribution: validDistribution,
          feeValue: 1000n,
          verification: { status: "verified" as const },
        }),
      };

      const stages: string[] = [];

      const receipt = await writeIc({
        account: funder,
        provider: mockProvider,
        functionName: "fund_escrow",
        args: [
          "PYPI_VERSION",
          "my-pkg",
          "1.2.0",
          recipient,
          "2026-10-15T00:00:00Z",
          "2026-10-17T00:00:00Z",
          bigintNonce,
        ],
        value: amountWei,
        onProgress: (stage) => stages.push(stage),
        client: mockClient,
        transactionKit: mockKit,
      });

      assert.equal(writeContractCalled, true, "writeContract must be reached without JSON serialization error");
      assert.equal(capturedParams.functionName, "fund_escrow");
      assert.equal(capturedParams.address, CONTRACT_ADDRESS);
      assert.equal(capturedParams.args[6], bigintNonce, "bigint nonce must be preserved exactly in writeContract args");
      assert.equal(capturedParams.value, amountWei);
      assert.equal(receipt.status, "FINALIZED");
      assert.ok(stages.includes("SUBMITTED"));
    });

    test("fee policy verification mismatch aborts transaction and does not silently fall through to SDK estimate", async () => {
      let writeContractCalled = false;
      const mockClient = {
        account: funder,
        estimateTransactionFees: async () => {
          throw new Error("SDK estimate should not be called on policy mismatch");
        },
        writeContract: async () => {
          writeContractCalled = true;
          return "0xtx";
        },
      };

      const mockMismatchKit = {
        estimate: async () => ({
          distribution: {},
          feeValue: 500n,
          verification: {
            status: "mismatch" as const,
            actualHash: "0xactual123" as `0x${string}`,
            expectedHash: "0xexpected456" as `0x${string}`,
          },
        }),
      };

      await assert.rejects(
        async () => {
          await writeIc({
            account: funder,
            provider: mockProvider,
            functionName: "fund_escrow",
            args: ["PYPI_VERSION", "pkg", "1.0", recipient, "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", 1n],
            client: mockClient,
            transactionKit: mockMismatchKit,
          });
        },
        /Fee policy verification mismatch/
      );

      assert.equal(writeContractCalled, false, "Must never proceed to writeContract upon fee policy mismatch");
    });

    test("isTemporaryNetworkOrTransportError accurately identifies temporary transport failures vs configuration/policy errors", () => {
      // Recognized temporary network/transport errors
      assert.equal(isTemporaryNetworkOrTransportError(new Error("fetch failed: ECONNREFUSED 127.0.0.1:4000")), true);
      assert.equal(isTemporaryNetworkOrTransportError(new Error("network request failed")), true);
      assert.equal(isTemporaryNetworkOrTransportError(new Error("ETIMEDOUT connection timed out")), true);
      assert.equal(isTemporaryNetworkOrTransportError(new Error("503 Service Unavailable")), true);
      assert.equal(isTemporaryNetworkOrTransportError({ code: "ECONNRESET", message: "socket hang up" }), true);
      assert.equal(isTemporaryNetworkOrTransportError({ name: "AbortError", message: "aborted" }), true);

      // Configuration, policy, verification, and unexpected errors MUST return false (fail closed)
      assert.equal(isTemporaryNetworkOrTransportError(new Error("Invalid fee suggestions profile: chainId 61997 mismatch")), false);
      assert.equal(isTemporaryNetworkOrTransportError(new Error("Policy verification failed: fee policy mismatch")), false);
      assert.equal(isTemporaryNetworkOrTransportError(new Error("Missing required argument: recipient")), false);
      assert.equal(isTemporaryNetworkOrTransportError(new TypeError("Cannot read properties of undefined")), false);
      assert.equal(isTemporaryNetworkOrTransportError(null), false);
      assert.equal(isTemporaryNetworkOrTransportError(undefined), false);
    });

    test("configuration, unexpected, and policy errors fail closed and propagate without falling back to SDK estimate", async () => {
      let sdkEstimateCalled = false;
      let writeContractCalled = false;

      const mockClient = {
        account: funder,
        estimateTransactionFees: async () => {
          sdkEstimateCalled = true;
          return { distribution: {}, feeValue: 1200n };
        },
        writeContract: async () => {
          writeContractCalled = true;
          return "0xtx_should_not_reach";
        },
      };

      // Case A: Configuration error from Transaction Kit
      const mockConfigErrorKit = {
        estimate: async () => {
          throw new Error("Invalid fee suggestions profile: chainId 61997 mismatch");
        },
      };

      await assert.rejects(
        async () => {
          await writeIc({
            account: funder,
            provider: mockProvider,
            functionName: "fund_escrow",
            args: ["PYPI_VERSION", "pkg", "1.0", recipient, "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", 1n],
            client: mockClient,
            transactionKit: mockConfigErrorKit,
          });
        },
        /Invalid fee suggestions profile/
      );

      // Case B: Unexpected TypeError
      const mockUnexpectedErrorKit = {
        estimate: async () => {
          throw new TypeError("Cannot read properties of undefined (reading 'chainId')");
        },
      };

      await assert.rejects(
        async () => {
          await writeIc({
            account: funder,
            provider: mockProvider,
            functionName: "fund_escrow",
            args: ["PYPI_VERSION", "pkg", "1.0", recipient, "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", 1n],
            client: mockClient,
            transactionKit: mockUnexpectedErrorKit,
          });
        },
        /Cannot read properties of undefined/
      );

      assert.equal(sdkEstimateCalled, false, "Must never fall back to SDK estimate on configuration or unexpected errors");
      assert.equal(writeContractCalled, false, "Must never proceed to writeContract on configuration or unexpected errors");
    });

    test("temporary network unavailability falls back to SDK fee estimate and proceeds to submission", async () => {
      let sdkEstimateCalled = false;
      let writeContractCalled = false;

      const mockClient = {
        account: funder,
        estimateTransactionFees: async () => {
          sdkEstimateCalled = true;
          return { distribution: validDistribution, feeValue: 1200n };
        },
        writeContract: async () => {
          writeContractCalled = true;
          return "0xtx_net_fallback";
        },
        getTransaction: async () => ({
          status: "FINALIZED",
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
      };

      const mockUnavailableKit = {
        estimate: async () => {
          throw new Error("fetch failed: ECONNREFUSED 127.0.0.1:4000");
        },
      };

      await writeIc({
        account: funder,
        provider: mockProvider,
        functionName: "fund_escrow",
        args: ["PYPI_VERSION", "pkg", "1.0", recipient, "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", 1n],
        client: mockClient,
        transactionKit: mockUnavailableKit,
      });

      assert.equal(sdkEstimateCalled, true, "Must fall back to SDK estimate when temporary transport failure occurs");
      assert.equal(writeContractCalled, true, "Must proceed to writeContract after network fallback");
    });

    test("requires both accepted/finalized status AND confirmed execution: missing execution evidence fails", async () => {
      // Mock returns FINALIZED status but lacks execution confirmation
      const mockClient = {
        account: funder,
        writeContract: async () => "0xtx_missing_exec",
        getTransaction: async () => ({
          status: "FINALIZED",
          statusName: "FINALIZED",
          // txExecutionResultName is missing / null
        }),
      };

      const mockKit = {
        estimate: async () => ({ distribution: validDistribution, feeValue: 0n, verification: { status: "verified" as const } }),
      };

      await assert.rejects(
        async () => {
          await writeIc({
            account: funder,
            provider: mockProvider,
            functionName: "release",
            args: ["0x123"],
            client: mockClient,
            transactionKit: mockKit,
          });
        },
        /missing confirmed execution evidence/
      );
    });

    test("requires confirmed execution: accepted/finalized status with reverted execution fails", async () => {
      // Mock returns FINALIZED status with execution revert
      const mockClient = {
        account: funder,
        writeContract: async () => "0xtx_reverted",
        getTransaction: async () => ({
          status: "FINALIZED",
          statusName: "FINALIZED",
          txExecutionResultName: "EXECUTION_ERROR",
          consensus_data: {
            leader_receipt: [
              {
                genvm_result: {
                  stderr: "UserError: registry 404 version not found",
                },
              },
            ],
          },
        }),
      };

      const mockKit = {
        estimate: async () => ({ distribution: validDistribution, feeValue: 0n, verification: { status: "verified" as const } }),
      };

      await assert.rejects(
        async () => {
          await writeIc({
            account: funder,
            provider: mockProvider,
            functionName: "release",
            args: ["0x123"],
            client: mockClient,
            transactionKit: mockKit,
          });
        },
        /UserError: registry 404 version not found/
      );
    });

    test("receipt shape: tx.result integer is not confused as contract return value; derived ID remains canonical", async () => {
      const mockClient = {
        account: funder,
        writeContract: async () => "0xtx_status_code",
        getTransaction: async () => ({
          status: "FINALIZED",
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          result: 0, // In GenLayer receipts, result is an execution status integer
        }),
      };

      const mockKit = {
        estimate: async () => ({ distribution: validDistribution, feeValue: 0n, verification: { status: "verified" as const } }),
      };

      const receipt = await writeIc({
        account: funder,
        provider: mockProvider,
        functionName: "fund_escrow",
        args: ["PYPI_VERSION", "pkg", "1.0", recipient, "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", 1n],
        client: mockClient,
        transactionKit: mockKit,
      });

      // returnedId must be null because tx.result: 0 is an execution result code, not a contract return value
      assert.equal(receipt.returnedId, null);
    });
  });

  describe("4. Lock Escrow ID Verification (verifyCreatedEscrow)", () => {
    const funder = "0x1111111111111111111111111111111111111111";
    const recipient = "0x2222222222222222222222222222222222222222";
    const template = "PYPI_VERSION";
    const pkg = "my-lib";
    const ver = "0.9.1";
    const amount = 1000000000000000000n;
    const nonce = 555666777n;
    const derivedId = deriveEscrowId({
      funder,
      recipient,
      template,
      packageName: pkg,
      version: ver,
      windowStartUtc: "2026-10-15T00:00:00Z",
      windowEndUtc: "2026-10-17T00:00:00Z",
      amountWei: amount,
      nonce,
    });

    test("rejects returnedId if it is not 0x + 64 hex or does not match derived ID", async () => {
      const mockClient = {
        readContract: async () => ({ status: "OPEN" }),
      };

      // Case A: Malformed returned ID
      await assert.rejects(
        async () => {
          await verifyCreatedEscrow({
            client: mockClient,
            contractAddress: CONTRACT_ADDRESS,
            expectedId: derivedId,
            returnedId: "0xshort",
            funder,
            recipient,
            template,
            packageName: pkg,
            version: ver,
            amountWei: amount,
            nonce,
          });
        },
        /Escrow ID mismatch/
      );

      // Case B: Valid 64-hex returned ID, but not equal to derived candidate ID
      const differentId = "0x" + "a".repeat(64);
      await assert.rejects(
        async () => {
          await verifyCreatedEscrow({
            client: mockClient,
            contractAddress: CONTRACT_ADDRESS,
            expectedId: derivedId,
            returnedId: differentId,
            funder,
            recipient,
            template,
            packageName: pkg,
            version: ver,
            amountWei: amount,
            nonce,
          });
        },
        /Escrow ID mismatch/
      );
    });

    test("rejects on-chain get_escrow that returns status OPEN but has parameter mismatch (does not accept status OPEN alone)", async () => {
      // Mock returns status OPEN, but wrong amount
      const mockClient = {
        readContract: async () => ({
          id: derivedId,
          status: "OPEN",
          funder,
          recipient,
          template,
          package_name: pkg,
          version: ver,
          amount: (amount + 1n).toString(), // Mismatched amount!
          nonce: nonce.toString(),
        }),
      };

      await assert.rejects(
        async () => {
          await verifyCreatedEscrow({
            client: mockClient,
            contractAddress: CONTRACT_ADDRESS,
            expectedId: derivedId,
            returnedId: derivedId,
            funder,
            recipient,
            template,
            packageName: pkg,
            version: ver,
            amountWei: amount,
            nonce,
            maxAttempts: 2,
            intervalMs: 10,
          });
        },
        /Escrow verification failed/
      );
    });

    test("successfully verifies and returns escrow when exact ID and all 8 parameters match", async () => {
      const validEscrow = {
        id: derivedId,
        status: "OPEN",
        funder,
        recipient,
        template,
        package_name: pkg,
        version: ver,
        amount: amount.toString(),
        nonce: nonce.toString(),
      };

      const mockClient = {
        readContract: async ({ address, functionName, args }: any) => {
          assert.equal(address, CONTRACT_ADDRESS);
          assert.equal(functionName, "get_escrow");
          assert.equal(args[0], derivedId);
          return validEscrow;
        },
      };

      const verified = await verifyCreatedEscrow({
        client: mockClient,
        contractAddress: CONTRACT_ADDRESS,
        expectedId: derivedId,
        returnedId: null, // Derived ID is canonical
        funder,
        recipient,
        template,
        packageName: pkg,
        version: ver,
        amountWei: amount,
        nonce,
        maxAttempts: 3,
        intervalMs: 10,
      });

      assert.deepEqual(verified, validEscrow);
    });
  });

  describe("5. ActionModal Outcome Polling (pollActionOutcome)", () => {
    const escrowId = "0x" + "b".repeat(64);
    const initialEscrow = {
      status: "OPEN",
      match_reason: "",
      amount: "5000000000000000000",
    };

    test("early release check leaving escrow OPEN returns OPEN_RETRYABLE with 0 payout and 0 refund", async () => {
      const mockClient = {
        readContract: async () => ({
          id: escrowId,
          status: "OPEN",
          match_reason: "EARLY_404_RETRYABLE",
          amount: "5000000000000000000",
          payout: "0",
          refund: "0",
        }),
      };

      const outcome = await pollActionOutcome({
        client: mockClient,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        action: "release",
        initialEscrow,
        maxAttempts: 2,
        intervalMs: 10,
      });

      assert.equal(outcome.status, "OPEN_RETRYABLE");
      assert.equal(outcome.matchReason, "EARLY_404_RETRYABLE");
      assert.equal(outcome.payout, "0", "Must never claim payout on retryable OPEN");
      assert.equal(outcome.refund, "0", "Must never claim refund on retryable OPEN");
    });

    test("stale read returning unupdated pre-tx state yields CONFIRMATION_PENDING without claiming false outcome", async () => {
      let pollCount = 0;
      const mockClient = {
        readContract: async () => {
          pollCount++;
          return {
            id: escrowId,
            status: "OPEN",
            match_reason: "",
            amount: "5000000000000000000",
          };
        },
      };

      const outcome = await pollActionOutcome({
        client: mockClient,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        action: "release",
        initialEscrow,
        maxAttempts: 3,
        intervalMs: 10,
      });

      assert.equal(pollCount, 3);
      assert.equal(outcome.status, "CONFIRMATION_PENDING");
      assert.equal(outcome.payout, "0");
      assert.equal(outcome.refund, "0");
    });

    test("pre-transaction get_escrow read failure: must not classify existing OPEN match_reason as fresh check", async () => {
      // When pre-tx read failed (initialEscrow is null/undefined), an existing on-chain OPEN with match_reason
      // must NOT be classified as fresh; it must return CONFIRMATION_PENDING.
      const mockClient = {
        readContract: async () => ({
          id: escrowId,
          status: "OPEN",
          match_reason: "EARLY_404_RETRYABLE", // Existing match reason on chain
          amount: "5000000000000000000",
        }),
      };

      const outcome = await pollActionOutcome({
        client: mockClient,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        action: "release",
        initialEscrow: null, // Baseline read failed!
        maxAttempts: 2,
        intervalMs: 10,
      });

      assert.equal(
        outcome.status, 
        "CONFIRMATION_PENDING", 
        "Must return CONFIRMATION_PENDING when baseline is missing rather than falsely claiming fresh check"
      );
      assert.equal(outcome.payout, "0");
      assert.equal(outcome.refund, "0");
    });

    test("successful in-window publication confirms RELEASED with 100% principal to recipient", async () => {
      const mockClient = {
        readContract: async () => ({
          id: escrowId,
          status: "RELEASED",
          match_reason: "200_IN_WINDOW",
          amount: "5000000000000000000",
          payout: "5000000000000000000",
          refund: "0",
        }),
      };

      const outcome = await pollActionOutcome({
        client: mockClient,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        action: "release",
        initialEscrow,
        maxAttempts: 2,
        intervalMs: 10,
      });

      assert.equal(outcome.status, "RELEASED");
      assert.equal(outcome.matchReason, "200_IN_WINDOW");
      assert.equal(outcome.payout, "5000000000000000000");
      assert.equal(outcome.refund, "0");
    });

    test("post-window absence confirms REFUND_NOHIT with 100% principal to funder", async () => {
      const mockClient = {
        readContract: async () => ({
          id: escrowId,
          status: "REFUND_NOHIT",
          match_reason: "WINDOW_EXPIRED_NO_RELEASE",
          amount: "5000000000000000000",
          payout: "0",
          refund: "5000000000000000000",
        }),
      };

      const outcome = await pollActionOutcome({
        client: mockClient,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        action: "release",
        initialEscrow,
        maxAttempts: 2,
        intervalMs: 10,
      });

      assert.equal(outcome.status, "REFUND_NOHIT");
      assert.equal(outcome.matchReason, "WINDOW_EXPIRED_NO_RELEASE");
      assert.equal(outcome.refund, "5000000000000000000");
      assert.equal(outcome.payout, "0");
    });
  });

  describe("6. Phase Timeout & Fee Allocation Bounds Verification (30-600)", () => {
    const funder = "0x1111111111111111111111111111111111111111";
    const recipient = "0x2222222222222222222222222222222222222222";
    const mockProvider = {
      request: async ({ method }: any) => {
        if (method === "eth_chainId") return "0xf22d"; // 61997
        return null;
      },
    };

    test("actual fee-profile.json configurations in root and web/src have all phase timeouts strictly within [30, 600]", () => {
      const rootProfile = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../fee-profile.json"), "utf8"));
      const webProfile = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "src/fee-profile.json"), "utf8"));

      assert.deepEqual(rootProfile, webProfile, "root fee-profile.json and web/src/fee-profile.json must match");

      for (const [methodName, config] of Object.entries(webProfile.methods as Record<string, any>)) {
        const leader = BigInt(config.leaderTimeunitsAllocation);
        const validator = BigInt(config.validatorTimeunitsAllocation);
        assert.ok(
          leader >= MIN_PHASE_TIMEOUT && leader <= MAX_PHASE_TIMEOUT,
          `Method ${methodName} leaderTimeunitsAllocation (${leader}) must be between 30 and 600`
        );
        assert.ok(
          validator >= MIN_PHASE_TIMEOUT && validator <= MAX_PHASE_TIMEOUT,
          `Method ${methodName} validatorTimeunitsAllocation (${validator}) must be between 30 and 600`
        );
      }

      // Explicitly check fund_escrow and release profiles (would have caught old 800 setting)
      assert.equal(webProfile.methods.fund_escrow.validatorTimeunitsAllocation, "400");
      assert.equal(webProfile.methods.fund_escrow.leaderTimeunitsAllocation, "200");
      assert.equal(webProfile.methods.release.validatorTimeunitsAllocation, "400");
      assert.equal(webProfile.methods.release.leaderTimeunitsAllocation, "200");

      assert.notEqual(
        webProfile.methods.fund_escrow.validatorTimeunitsAllocation,
        "800",
        "Must never configure 800 validator timeunits (exceeds Studio Next 600 cap)"
      );
      assert.notEqual(
        webProfile.methods.release.validatorTimeunitsAllocation,
        "800",
        "Must never configure 800 validator timeunits (exceeds Studio Next 600 cap)"
      );
    });

    test("validatePhaseAllocations rejects validator allocation of 800 (failed tx exact setting)", () => {
      assert.throws(
        () => {
          validatePhaseAllocations({
            leaderTimeunitsAllocation: 400n,
            validatorTimeunitsAllocation: 800n,
          });
        },
        /Validator phase allocation \(800\) out of bounds: must be between 30 and 600 timeunits/
      );
    });

    test("validatePhaseAllocations rejects leader and validator allocations outside [30, 600]", () => {
      // Under minimum (30)
      assert.throws(
        () => validatePhaseAllocations({ leaderTimeunitsAllocation: 20n, validatorTimeunitsAllocation: 200n }),
        /Leader phase allocation \(20\) out of bounds/
      );
      assert.throws(
        () => validatePhaseAllocations({ leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 25n }),
        /Validator phase allocation \(25\) out of bounds/
      );
      // Over maximum (600)
      assert.throws(
        () => validatePhaseAllocations({ leaderTimeunitsAllocation: 650n, validatorTimeunitsAllocation: 400n }),
        /Leader phase allocation \(650\) out of bounds/
      );
      assert.throws(
        () => validatePhaseAllocations({ leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 601n }),
        /Validator phase allocation \(601\) out of bounds/
      );
      // Valid boundaries
      assert.doesNotThrow(() =>
        validatePhaseAllocations({ leaderTimeunitsAllocation: 30n, validatorTimeunitsAllocation: 30n })
      );
      assert.doesNotThrow(() =>
        validatePhaseAllocations({ leaderTimeunitsAllocation: 600n, validatorTimeunitsAllocation: 600n })
      );
      assert.doesNotThrow(() =>
        validatePhaseAllocations({ leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 400n })
      );
    });

    test("writeIc Transaction Kit path: rejects configured 800 allocation before wallet signing and never calls writeContract", async () => {
      let writeContractCalled = false;
      const mockClient = {
        account: funder,
        writeContract: async () => {
          writeContractCalled = true;
          return "0xtx_should_not_reach";
        },
      };

      // Mock TransactionKit returning the uncorrected 800 validator allocation
      const mockKit800 = {
        estimate: async () => ({
          distribution: {
            leaderTimeunitsAllocation: 400n,
            validatorTimeunitsAllocation: 800n,
          },
          feeValue: 5000n,
          verification: { status: "verified" as const },
        }),
      };

      await assert.rejects(
        async () => {
          await writeIc({
            account: funder,
            provider: mockProvider,
            functionName: "fund_escrow",
            args: ["PYPI_VERSION", "pkg", "1.0", recipient, "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", 1n],
            client: mockClient,
            transactionKit: mockKit800,
          });
        },
        /Validator phase allocation \(800\) out of bounds/
      );

      assert.equal(writeContractCalled, false, "Must never prompt wallet or submit tx when phase allocation is 800");
    });

    test("writeIc fallback path: rejects out-of-bounds allocation before estimate/writeContract", async () => {
      let estimateCalled = false;
      let writeContractCalled = false;
      const mockTransportErrorKit = {
        estimate: async () => {
          throw new Error("fetch failed: ECONNREFUSED 127.0.0.1:4000");
        },
      };

      // In fallback path with invalid custom distribution returned by estimateTransactionFees
      const mockBadEstimateClient = {
        account: funder,
        estimateTransactionFees: async () => {
          estimateCalled = true;
          return {
            distribution: { leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 800n },
            feeValue: 5000n,
          };
        },
        writeContract: async () => {
          writeContractCalled = true;
          return "0xtx_should_not_reach";
        },
      };

      await assert.rejects(
        async () => {
          await writeIc({
            account: funder,
            provider: mockProvider,
            functionName: "fund_escrow",
            args: ["PYPI_VERSION", "pkg", "1.0", recipient, "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", 1n],
            client: mockBadEstimateClient,
            transactionKit: mockTransportErrorKit,
          });
        },
        /Validator phase allocation \(800\) out of bounds/
      );

      assert.equal(estimateCalled, true, "Fallback estimateTransactionFees was invoked");
      assert.equal(writeContractCalled, false, "Must never call writeContract when distribution is out of bounds");
    });

    test("writeIc with corrected profile successfully passes validated fee parameters to writeContract for fund_escrow and release", async () => {
      let capturedFeesFund: any = null;
      let capturedFeesRelease: any = null;

      const mockClient = {
        account: funder,
        writeContract: async (params: any) => {
          if (params.functionName === "fund_escrow") capturedFeesFund = params.fees;
          if (params.functionName === "release") capturedFeesRelease = params.fees;
          return "0xtx_success";
        },
        getTransaction: async () => ({
          status: "FINALIZED",
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
      };

      const mockKitFund = {
        estimate: async () => ({
          distribution: {
            leaderTimeunitsAllocation: 200n,
            validatorTimeunitsAllocation: 400n,
            appealRounds: 0n,
            rotations: [0n],
          },
          feeValue: 25000000000005176n,
          verification: { status: "verified" as const },
        }),
      };

      await writeIc({
        account: funder,
        provider: mockProvider,
        functionName: "fund_escrow",
        args: ["PYPI_VERSION", "pkg", "1.0", recipient, "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", 1n],
        client: mockClient,
        transactionKit: mockKitFund,
      });

      assert.ok(capturedFeesFund);
      assert.equal(capturedFeesFund.distribution.leaderTimeunitsAllocation, 200n);
      assert.equal(capturedFeesFund.distribution.validatorTimeunitsAllocation, 400n);
      assert.ok(capturedFeesFund.distribution.leaderTimeunitsAllocation >= 30n && capturedFeesFund.distribution.leaderTimeunitsAllocation <= 600n);
      assert.ok(capturedFeesFund.distribution.validatorTimeunitsAllocation >= 30n && capturedFeesFund.distribution.validatorTimeunitsAllocation <= 600n);

      const mockKitRelease = {
        estimate: async () => ({
          distribution: {
            leaderTimeunitsAllocation: 200n,
            validatorTimeunitsAllocation: 400n,
            appealRounds: 0n,
            rotations: [0n],
          },
          feeValue: 25000000000005176n,
          verification: { status: "verified" as const },
        }),
      };

      await writeIc({
        account: funder,
        provider: mockProvider,
        functionName: "release",
        args: ["0x123"],
        client: mockClient,
        transactionKit: mockKitRelease,
      });

      assert.ok(capturedFeesRelease);
      assert.equal(capturedFeesRelease.distribution.leaderTimeunitsAllocation, 200n);
      assert.equal(capturedFeesRelease.distribution.validatorTimeunitsAllocation, 400n);
      assert.ok(capturedFeesRelease.distribution.leaderTimeunitsAllocation >= 30n && capturedFeesRelease.distribution.leaderTimeunitsAllocation <= 600n);
      assert.ok(capturedFeesRelease.distribution.validatorTimeunitsAllocation >= 30n && capturedFeesRelease.distribution.validatorTimeunitsAllocation <= 600n);
    });
  });
});

// Deployment script verification tests
import "./deploy.test";

