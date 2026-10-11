import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execSync } from "node:child_process";
import { studioDevnet } from "genlayer-js/chains";
import {
  buildDeployFeeEstimateOptions,
  extractContractAddress,
  isDeploymentExecutionSuccessful,
  deployShipLockContract,
} from "../src/lib/deploy";
import feeProfile from "../src/fee-profile.json";

describe("ShipLock Contract Deployment Script - genlayer-js & Studio Next", () => {
  const dummyCode = "class ShipLock:\n    def __init__(self):\n        pass\n";
  const validAddress = "0x53EAd6deB8103B278e663Bc9808926FB7B308a63";
  const expectedLower = validAddress.toLowerCase() as `0x${string}`;
  const conflictingAddress = "0xF52d9FD2a1542b3F84417a916f3aB4B4631D0b3D";
  const dummyTxHash = "0xe193586d4939aaf247788ee3526dda5e2d403eb5ca482606b4dbe954d3d5a355" as `0x${string}`;

  const sampleDistribution = {
    leaderTimeunitsAllocation: 125n,
    validatorTimeunitsAllocation: 250n,
    appealRounds: 0n,
    executionBudgetPerRound: 25000000000000000n,
    executionConsumed: 0n,
    totalMessageFees: 0n,
    rotations: [1n],
    maxPriceGenPerTimeUnit: 1000000000n,
    storageFeeMaxGasPrice: 1000000000n,
    receiptFeeMaxGasPrice: 1000000000n,
  };

  const sampleFeeEstimate = {
    distribution: sampleDistribution,
    feeValue: 50000000000000000n,
    policy: {
      enabled: true,
      genPerTimeUnit: 1000000000n,
      storageUnitPrice: 1000000000n,
      receiptGasPrice: 1000000000n,
      executionBudgetFloor: 25000000000000000n,
    },
  };

  describe("1. Chain Selection", () => {
    test("rejects deployment if client chain ID does not match studioDevnet (61997)", async () => {
      const wrongChainClient = {
        chain: { id: 1, name: "Ethereum Mainnet" },
        estimateTransactionFees: async () => sampleFeeEstimate,
        deployContract: async () => dummyTxHash,
        waitForTransactionReceipt: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }),
      };

      await assert.rejects(
        async () => {
          await deployShipLockContract({
            client: wrongChainClient,
            contractCode: dummyCode,
          });
        },
        {
          name: "Error",
          message: `Invalid chain selection: expected Studio Next (chainId ${studioDevnet.id}), received chainId 1.`,
        }
      );
    });

    test("rejects deployment if client chain is missing or has unknown chainId", async () => {
      const noChainClient = {
        chain: undefined,
      };

      await assert.rejects(
        async () => {
          await deployShipLockContract({
            client: noChainClient,
            contractCode: dummyCode,
          });
        },
        /Invalid chain selection: expected Studio Next/
      );
    });

    test("accepts client configured with studioDevnet (chainId 61997)", async () => {
      const validClient = {
        chain: studioDevnet,
        estimateTransactionFees: async () => sampleFeeEstimate,
        deployContract: async () => dummyTxHash,
        waitForTransactionReceipt: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          contract_address: validAddress,
        }),
      };

      const result = await deployShipLockContract({
        client: validClient,
        contractCode: dummyCode,
      });

      assert.equal(result.contractAddress, expectedLower);
      assert.equal(result.txHash, dummyTxHash);
    });
  });

  describe("2. Fee Profile & Fee Submission", () => {
    test("buildDeployFeeEstimateOptions extracts expected parameters from fee-profile.json", () => {
      const options = buildDeployFeeEstimateOptions(feeProfile.deploy);
      assert.equal(options.leaderTimeunitsAllocation, 125n);
      assert.equal(options.validatorTimeunitsAllocation, 250n);
      assert.equal(options.executionBudgetPerRound, 25000000000000000n);
      assert.equal(options.totalMessageFees, 0n);
      assert.deepEqual(options.rotations, [1n]);
    });

    test("passes fee estimate options to estimateTransactionFees and sends returned distribution and feeValue unchanged to deployContract", async () => {
      let capturedEstimateOptions: any = null;
      let capturedDeployArgs: any = null;

      const mockClient = {
        chain: studioDevnet,
        estimateTransactionFees: async (opts: any) => {
          capturedEstimateOptions = opts;
          return sampleFeeEstimate;
        },
        deployContract: async (args: any) => {
          capturedDeployArgs = args;
          return dummyTxHash;
        },
        waitForTransactionReceipt: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
          contract_address: validAddress,
        }),
      };

      await deployShipLockContract({
        client: mockClient,
        contractCode: dummyCode,
        feeProfile: feeProfile.deploy,
      });

      assert.equal(capturedEstimateOptions.leaderTimeunitsAllocation, 125n);
      assert.equal(capturedEstimateOptions.validatorTimeunitsAllocation, 250n);
      assert.equal(capturedEstimateOptions.executionBudgetPerRound, 25000000000000000n);
      assert.equal(capturedEstimateOptions.totalMessageFees, 0n);
      assert.deepEqual(capturedEstimateOptions.rotations, [1n]);

      assert.equal(capturedDeployArgs.fees.distribution, sampleFeeEstimate.distribution);
      assert.equal(capturedDeployArgs.fees.feeValue, sampleFeeEstimate.feeValue);
      assert.equal(capturedDeployArgs.code, dummyCode);
    });

    test("throws if estimateTransactionFees returns invalid or missing distribution", async () => {
      const faultyClient = {
        chain: studioDevnet,
        estimateTransactionFees: async () => ({
          distribution: undefined,
          feeValue: 1000n,
        }),
      };

      await assert.rejects(
        async () => {
          await deployShipLockContract({
            client: faultyClient,
            contractCode: dummyCode,
          });
        },
        /Failed to estimate deployment fees from fee profile/
      );
    });
  });

  describe("3. Execution Verification & Finalization Enforcement", () => {
    test("requires FINALIZED status: rejects ACCEPTED even with FINISHED_WITH_RETURN", () => {
      const acceptedReceipt = {
        statusName: "ACCEPTED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      };
      // Must return false because FINALIZED is strictly required
      assert.equal(isDeploymentExecutionSuccessful(null, acceptedReceipt), false);
    });

    test("requires FINALIZED status: accepts FINALIZED with FINISHED_WITH_RETURN", () => {
      const finalizedReceipt = {
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      };
      assert.equal(isDeploymentExecutionSuccessful(null, finalizedReceipt), true);
    });

    test("rejects receipt with non-final status (PENDING)", () => {
      const pendingReceipt = {
        statusName: "PENDING",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      };
      assert.equal(isDeploymentExecutionSuccessful(null, pendingReceipt), false);
    });

    test("rejects finalized receipt with failed execution result", () => {
      const failedReceipt = {
        statusName: "FINALIZED",
        txExecutionResultName: "EXECUTION_FAILED",
      };
      assert.equal(isDeploymentExecutionSuccessful(null, failedReceipt), false);
    });

    test("fails closed if client.isSuccessful helper throws an error", () => {
      const explodingClient = {
        isSuccessful: () => {
          throw new Error("SDK internal error during receipt inspection");
        },
      };
      const receipt = {
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      };
      // Must fail closed (return false)
      assert.equal(isDeploymentExecutionSuccessful(explodingClient, receipt), false);
    });

    test("returns false for null, undefined, or non-object receipts", () => {
      assert.equal(isDeploymentExecutionSuccessful(null, null), false);
      assert.equal(isDeploymentExecutionSuccessful(null, undefined), false);
      assert.equal(isDeploymentExecutionSuccessful(null, "not-a-receipt"), false);
    });

    test("deployShipLockContract throws if waitForTransactionReceipt reveals execution failure", async () => {
      const failingClient = {
        chain: studioDevnet,
        estimateTransactionFees: async () => sampleFeeEstimate,
        deployContract: async () => dummyTxHash,
        waitForTransactionReceipt: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "EXECUTION_FAILED",
          contract_address: validAddress,
        }),
      };

      await assert.rejects(
        async () => {
          await deployShipLockContract({
            client: failingClient,
            contractCode: dummyCode,
          });
        },
        /Deployment transaction execution failed: status=FINALIZED, executionResult=EXECUTION_FAILED/
      );
    });

    test("deployShipLockContract throws if deployContract does not return a transaction hash", async () => {
      const noTxClient = {
        chain: studioDevnet,
        estimateTransactionFees: async () => sampleFeeEstimate,
        deployContract: async () => null,
      };

      await assert.rejects(
        async () => {
          await deployShipLockContract({
            client: noTxClient,
            contractCode: dummyCode,
          });
        },
        /deployContract did not return a transaction hash/
      );
    });
  });

  describe("4. Contract Address Extraction & Conflict Rejection", () => {
    test("prefers txDataDecoded.contractAddress when present", () => {
      const receipt = {
        txDataDecoded: { contractAddress: validAddress },
        contract_address: validAddress,
      };
      const addr = extractContractAddress(receipt);
      assert.equal(addr, expectedLower);
    });

    test("extracts when only txDataDecoded.contractAddress is present", () => {
      const receipt = {
        txDataDecoded: { contractAddress: validAddress },
      };
      const addr = extractContractAddress(receipt);
      assert.equal(addr, expectedLower);
    });

    test("extracts from contract_address when txDataDecoded is absent", () => {
      const receipt = {
        contract_address: validAddress,
      };
      const addr = extractContractAddress(receipt);
      assert.equal(addr, expectedLower);
    });

    test("extracts from data.contract_address or recipient when txDataDecoded is absent", () => {
      assert.equal(extractContractAddress({ data: { contract_address: validAddress } }), expectedLower);
      assert.equal(extractContractAddress({ recipient: validAddress }), expectedLower);
    });

    test("rejects conflicting address fields between txDataDecoded and contract_address", () => {
      const receiptWithConflict = {
        txDataDecoded: { contractAddress: validAddress },
        contract_address: conflictingAddress,
      };

      assert.throws(
        () => extractContractAddress(receiptWithConflict),
        /Conflicting contract address fields detected in receipt/
      );
    });

    test("rejects conflicting address fields between contract_address and recipient", () => {
      const receiptWithConflict = {
        contract_address: validAddress,
        recipient: conflictingAddress,
      };

      assert.throws(
        () => extractContractAddress(receiptWithConflict),
        /Conflicting contract address fields detected in receipt/
      );
    });

    test("throws if deployment receipt is null or missing contract address", () => {
      assert.throws(() => extractContractAddress(null), /Deployment receipt is invalid or missing/);
      assert.throws(() => extractContractAddress({}), /Deployment receipt does not contain a contract address/);
    });

    test("throws if extracted address is not a valid 20-byte hex string", () => {
      assert.throws(
        () => extractContractAddress({ txDataDecoded: { contractAddress: "not-an-address" } }),
        /contains invalid contract address/
      );
      assert.throws(
        () => extractContractAddress({ contract_address: "0x1234" }),
        /contains invalid contract address/
      );
      assert.throws(
        () => extractContractAddress({ contract_address: validAddress.slice(2) }), // missing 0x
        /contains invalid contract address/
      );
    });
  });

  describe("5. End-to-End Deployment Flow with Progress Tracking", () => {
    test("runs complete deployment lifecycle, calls onProgress hooks, and returns full result", async () => {
      const stages: string[] = [];
      let waitedUntil: string | undefined = undefined;

      const mockClient = {
        chain: studioDevnet,
        estimateTransactionFees: async () => sampleFeeEstimate,
        deployContract: async () => dummyTxHash,
        waitForTransactionReceipt: async ({ waitUntil }: any) => {
          waitedUntil = waitUntil;
          return {
            statusName: "FINALIZED",
            txExecutionResultName: "FINISHED_WITH_RETURN",
            txDataDecoded: { contractAddress: validAddress },
          };
        },
      };

      const result = await deployShipLockContract({
        client: mockClient,
        contractCode: dummyCode,
        feeProfile: feeProfile.deploy,
        onProgress: (stage) => stages.push(stage),
      });

      assert.equal(result.contractAddress, expectedLower);
      assert.equal(result.txHash, dummyTxHash);
      assert.equal(waitedUntil, "finalized");
      assert.deepEqual(stages, [
        "ESTIMATING_FEES",
        "SUBMITTING_DEPLOYMENT",
        "WAITING_FINALIZATION",
        "DEPLOYMENT_SUCCESS",
      ]);
    });
  });

  describe("6. CLI-Level Dry-Run Command Verification", () => {
    test("executes exact documented command 'npm --prefix web run deploy -- --dry-run' and completes dry run", () => {
      const workspaceRoot = path.resolve(__dirname, "../../");
      const cmd = "npm --prefix web run deploy -- --dry-run";

      const output = execSync(cmd, {
        cwd: workspaceRoot,
        encoding: "utf-8",
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
      });

      assert.match(output, /=== ShipLock Studio Next Contract Deployer ===/);
      assert.match(output, /\[\+\] Dry-run validation:/);
      assert.match(output, /Fee profile loaded: deploy =/);
      assert.match(output, /\[✓\] Dry run completed\. Ready for deployment\./);
    });
  });
});
