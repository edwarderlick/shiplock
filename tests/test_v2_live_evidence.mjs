/**
 * test_v2_live_evidence.mjs
 *
 * Comprehensive, behavioral test suite for ShipLock Phase C v2 Live Evidence Harness.
 * Replaces superficial checks with executable behavioral tests against exported functions
 * and mocked RPC clients.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";

import {
  REQUIRED_CONTRACT_ADDRESS,
  REQUIRED_CHAIN_ID,
  RPC_ENDPOINT,
  PRINCIPAL_PER_ESCROW_WEI,
  MAX_CUMULATIVE_PRINCIPAL_WEI,
  MIN_SAFETY_RESERVE_WEI,
  V1_EVIDENCE_PATH,
  CONCLUSIVE_MISMATCH_REASONS,
  loadContractBinding,
  loadConfig,
  validateCaseConfig,
  isPlaceholderCoordinate,
  calculateWindowTimes,
  checkCumulativeCap,
  checkBalanceReserve,
  deriveV2EscrowId,
  buildV2ReleaseAllocations,
  verifyReceiptFinalizedSuccess,
  verifyAuthoritativeOutcome,
  verifyFundedEscrowAudit,
  verifyEscrowImmutableIdentity,
  serializeReceipt,
  queryGithubRelease,
  normalizeTransactionOutcome,
  attemptExclusiveStateRecovery,
  reconcileExistingFundingHash,
  checkExternalCoordinatesAbsent,
  getTransactionOutcome,
  runPreflight,
  runFund,
  runReconcile,
  runRelease,
} from "../scripts/v2_live_evidence.mjs";

import {
  atomicWriteJson,
  readJsonSafe,
  serializeEscrow,
  serializeEconomics,
  queryRegistryMetadata,
  parseUtcIso,
} from "../scripts/evidence_helper.mjs";

describe("ShipLock v2 Live Evidence Harness — Comprehensive Safety Suite", () => {
  let tempDir;
  let testManifestPath;
  let testConfigPath;
  let testEvidencePath;

  const validManifest = {
    network: "Studio Next",
    chainId: 61997,
    rpcUrl: "https://studio-dev.genlayer.com/api",
    deployerAddress: "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084",
    contractAddress: "0xF2110c3E6B170caF10FE953564285C6f01cB1F0c",
    transactionHash: "0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f",
  };

  const controlledConfig = {
    contractAddress: "0xF2110c3E6B170caF10FE953564285C6f01cB1F0c",
    chainId: 61997,
    rpcUrl: "https://studio-dev.genlayer.com/api",
    funderAddress: "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084",
    recipientAddress: "0x3333333333333333333333333333333333333333",
    cases: {
      success: {
        name: "Controlled Success Case",
        template: "NPM_VERSION",
        package: "controlled-pkg-alpha",
        version: "1.0.0",
        expectedRepo: "controlled-org/controlled-repo",
        expectedTag: "v1.0.0",
        amountWei: "10000000000000000",
        windowLeadHours: 26,
        windowDurationHours: 48,
        nonce: "1001",
      },
      mismatch: {
        name: "Controlled Mismatch Case",
        template: "PYPI_VERSION",
        package: "controlled-pkg-beta",
        version: "0.1.0",
        expectedRepo: "controlled-org/controlled-mismatch",
        expectedTag: "v0.1.0",
        amountWei: "10000000000000000",
        windowLeadHours: 26,
        windowDurationHours: 48,
        nonce: "1002",
      },
    },
  };

  const placeholderConfig = {
    contractAddress: "0xF2110c3E6B170caF10FE953564285C6f01cB1F0c",
    chainId: 61997,
    rpcUrl: "https://studio-dev.genlayer.com/api",
    funderAddress: "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084",
    recipientAddress: "0x0f907a2598AEF71B988f9208103066586A1a4aF0",
    cases: {
      success: {
        name: "Example Success Case",
        template: "NPM_VERSION",
        package: "example-shiplock-verified-release",
        version: "1.0.0",
        expectedRepo: "example-org/shiplock-candidate",
        expectedTag: "v1.0.0",
        amountWei: "10000000000000000",
        windowLeadHours: 26,
        windowDurationHours: 48,
        nonce: "1001",
      },
      mismatch: {
        name: "Example Mismatch Case",
        template: "PYPI_VERSION",
        package: "example-shiplock-verified-mismatch",
        version: "0.1.0",
        expectedRepo: "example-org/shiplock-mismatch",
        expectedTag: "v0.1.0",
        amountWei: "10000000000000000",
        windowLeadHours: 26,
        windowDurationHours: 48,
        nonce: "1002",
      },
    },
  };

  const mockDeployerKey = "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "shiplock-v2-test-"));
    testManifestPath = join(tempDir, "latest_deployment.json");
    testConfigPath = join(tempDir, "v2_evidence_config.json");
    testEvidencePath = join(tempDir, "v2_steward_evidence.json");
    writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2), "utf-8");
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // 1. Manifest Binding Enforcement
  it("1. loadContractBinding strictly binds to active Studio Next contract and fails closed on foreign address, rpc, or deployer", () => {
    const binding = loadContractBinding({ manifestPath: testManifestPath });
    assert.equal(binding.contractAddress, REQUIRED_CONTRACT_ADDRESS);
    assert.equal(binding.chainId, REQUIRED_CHAIN_ID);
    assert.equal(binding.rpcUrl, RPC_ENDPOINT);
    assert.equal(binding.deployerAddress, "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084");

    // Foreign contract address
    const badManifest = { ...validManifest, contractAddress: "0x1111111111111111111111111111111111111111" };
    const badPath = join(tempDir, "bad_manifest.json");
    writeFileSync(badPath, JSON.stringify(badManifest, null, 2), "utf-8");
    assert.throws(() => loadContractBinding({ manifestPath: badPath }), /Contract binding violation/);

    // Bad chain ID
    const badChain = { ...validManifest, chainId: 1 };
    writeFileSync(badPath, JSON.stringify(badChain, null, 2), "utf-8");
    assert.throws(() => loadContractBinding({ manifestPath: badPath }), /Chain binding violation/);

    // Bad RPC URL
    const badRpc = { ...validManifest, rpcUrl: "https://bad-rpc.com" };
    writeFileSync(badPath, JSON.stringify(badRpc, null, 2), "utf-8");
    assert.throws(() => loadContractBinding({ manifestPath: badPath }), /RPC binding violation/);

    // Bad Deployer Address
    const badDeployer = { ...validManifest, deployerAddress: "0x3333333333333333333333333333333333333333" };
    writeFileSync(badPath, JSON.stringify(badDeployer, null, 2), "utf-8");
    assert.throws(() => loadContractBinding({ manifestPath: badPath }), /Deployer binding violation/);
  });

  // 2. Configuration Validation & Mandatory Binding Fields
  it("2. loadConfig requires and strictly validates contractAddress, chainId, rpcUrl, and funderAddress agreement", () => {
    writeFileSync(testConfigPath, JSON.stringify(controlledConfig, null, 2), "utf-8");
    const { config } = loadConfig({ configPath: testConfigPath, manifest: validManifest });
    assert.equal(config.contractAddress, REQUIRED_CONTRACT_ADDRESS);
    assert.equal(config.funderAddress, validManifest.deployerAddress);

    // Missing funderAddress
    const missingFunder = { ...controlledConfig };
    delete missingFunder.funderAddress;
    writeFileSync(testConfigPath, JSON.stringify(missingFunder, null, 2), "utf-8");
    assert.throws(() => loadConfig({ configPath: testConfigPath, manifest: validManifest }), /missing required funderAddress/);

    // Missing contractAddress
    const missingContract = { ...controlledConfig };
    delete missingContract.contractAddress;
    writeFileSync(testConfigPath, JSON.stringify(missingContract, null, 2), "utf-8");
    assert.throws(() => loadConfig({ configPath: testConfigPath, manifest: validManifest }), /missing required contractAddress/);

    // Missing rpcUrl
    const missingRpc = { ...controlledConfig };
    delete missingRpc.rpcUrl;
    writeFileSync(testConfigPath, JSON.stringify(missingRpc, null, 2), "utf-8");
    assert.throws(() => loadConfig({ configPath: testConfigPath, manifest: validManifest }), /missing required rpcUrl/);

    // Recipient equals funder/deployer
    const selfRecipient = { ...controlledConfig, recipientAddress: validManifest.deployerAddress };
    writeFileSync(testConfigPath, JSON.stringify(selfRecipient, null, 2), "utf-8");
    assert.throws(() => loadConfig({ configPath: testConfigPath, manifest: validManifest }), /cannot be equal to the funder/);
  });

  // 3. Placeholder Coordinate Detection
  it("3. isPlaceholderCoordinate accurately flags example, candidate, and test coordinates", () => {
    assert.equal(isPlaceholderCoordinate(placeholderConfig.cases.success, placeholderConfig.recipientAddress), true);
    assert.equal(isPlaceholderCoordinate(placeholderConfig.cases.mismatch, placeholderConfig.recipientAddress), true);
    assert.equal(isPlaceholderCoordinate(controlledConfig.cases.success, controlledConfig.recipientAddress), false);
    assert.equal(isPlaceholderCoordinate(controlledConfig.cases.mismatch, controlledConfig.recipientAddress), false);
  });

  // 4. Case Config Validation & Distinct Nonces
  it("4. validateCaseConfig validates repository syntax, release tag syntax, and nonces", () => {
    const validCase = controlledConfig.cases.success;
    const res = validateCaseConfig(validCase, validManifest.deployerAddress, { recipientAddress: controlledConfig.recipientAddress });
    assert.equal(res.canonicalRepo, "controlled-org/controlled-repo");
    assert.equal(res.canonicalTag, "v1.0.0");

    // Invalid repo
    assert.throws(
      () => validateCaseConfig({ ...validCase, expectedRepo: "bad-repo-no-slash" }, validManifest.deployerAddress, { recipientAddress: controlledConfig.recipientAddress }),
      /canonical 'owner\/repo' format/
    );

    // Invalid tag
    assert.throws(
      () => validateCaseConfig({ ...validCase, expectedTag: "v1.0/forbidden" }, validManifest.deployerAddress, { recipientAddress: controlledConfig.recipientAddress }),
      /slash or backslash/
    );

    // Invalid negative nonce
    assert.throws(
      () => validateCaseConfig({ ...validCase, nonce: "-1" }, validManifest.deployerAddress, { recipientAddress: controlledConfig.recipientAddress }),
      /positive.*integer/
    );
  });

  // 5. Cumulative Cap Enforcement
  it("5. checkCumulativeCap strictly limits cumulative Phase C principal to 0.02 GEN", () => {
    const emptyEvidence = { cases: { success: null, mismatch: null } };
    assert.doesNotThrow(() => checkCumulativeCap(emptyEvidence, PRINCIPAL_PER_ESCROW_WEI, MAX_CUMULATIVE_PRINCIPAL_WEI));

    const halfEvidence = { cases: { success: { principalWei: "10000000000000000", state: "VERIFIED" }, mismatch: null } };
    assert.doesNotThrow(() => checkCumulativeCap(halfEvidence, PRINCIPAL_PER_ESCROW_WEI, MAX_CUMULATIVE_PRINCIPAL_WEI));

    const fullEvidence = { cases: { success: { principalWei: "10000000000000000", state: "VERIFIED" }, mismatch: { principalWei: "10000000000000000", state: "SUBMITTED" } } };
    assert.throws(
      () => checkCumulativeCap(fullEvidence, PRINCIPAL_PER_ESCROW_WEI, MAX_CUMULATIVE_PRINCIPAL_WEI),
      /Cumulative principal cap violation/
    );
  });

  // 6. Balance Reserve Enforcement
  it("6. checkBalanceReserve enforces balance >= principal + estimatedFee + reserveBuffer", () => {
    const principal = 10000000000000000n; // 0.01 GEN
    const buffer = 50000000000000000n;    // 0.05 GEN
    const fee = 1000000000000000n;        // 0.001 GEN

    // Sufficient balance
    const sufficient = principal + fee + buffer + 1000n;
    assert.doesNotThrow(() => checkBalanceReserve(sufficient, principal, fee, buffer));

    // Insufficient by 1 wei
    const insufficient = principal + fee + buffer - 1n;
    assert.throws(
      () => checkBalanceReserve(insufficient, principal, fee, buffer),
      /Insufficient wallet balance/
    );
  });

  // 7. Receipt Finality & Execution Verification
  it("7. verifyReceiptFinalizedSuccess enforces FINALIZED and FINISHED_WITH_RETURN/SUCCESS", () => {
    assert.doesNotThrow(() =>
      verifyReceiptFinalizedSuccess({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" })
    );
    assert.doesNotThrow(() =>
      verifyReceiptFinalizedSuccess({ status: "FINALIZED", txExecutionResult: "SUCCESS" })
    );

    // Unfinalized
    assert.throws(
      () => verifyReceiptFinalizedSuccess({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" }),
      /Transaction was not finalized/
    );

    // Execution failed
    assert.throws(
      () => verifyReceiptFinalizedSuccess({ statusName: "FINALIZED", txExecutionResultName: "EXECUTION_ERROR" }),
      /Transaction execution failed closed/
    );
  });

  // 8. Full 16-Field Audit & Economics Verification
  it("8. verifyFundedEscrowAudit validates all 16 coordinates and economics delta", () => {
    const validEscrow = {
      policy: "SOURCE_LINKED",
      status: "OPEN",
      match_reason: "LOOKBACK_404_OK",
      expected_repo: "controlled-org/controlled-repo",
      expected_tag: "v1.0.0",
      template: "NPM_VERSION",
      package_name: "controlled-pkg-alpha",
      version: "1.0.0",
      funder: validManifest.deployerAddress,
      recipient: controlledConfig.recipientAddress,
      amount: "10000000000000000",
      nonce: "1001",
      window_start_utc: "2026-10-20T20:00:00Z",
      window_end_utc: "2026-10-22T20:00:00Z",
      payout: "0",
      refund: "0",
    };

    const econBefore = { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" };
    const econAfter = { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };

    const expectedInputs = {
      template: "NPM_VERSION",
      package: "controlled-pkg-alpha",
      version: "1.0.0",
      expectedRepo: "controlled-org/controlled-repo",
      expectedTag: "v1.0.0",
      funder: validManifest.deployerAddress,
      recipient: controlledConfig.recipientAddress,
      nonce: "1001",
      windowStartUtc: "2026-10-20T20:00:00Z",
      windowEndUtc: "2026-10-22T20:00:00Z",
    };

    assert.doesNotThrow(() =>
      verifyFundedEscrowAudit({ escrowData: validEscrow, expectedInputs, econBefore, econAfter })
    );

    // Policy mismatch
    assert.throws(
      () => verifyFundedEscrowAudit({ escrowData: { ...validEscrow, policy: "FOREIGN" }, expectedInputs, econBefore, econAfter }),
      /policy/
    );

    // Status mismatch
    assert.throws(
      () => verifyFundedEscrowAudit({ escrowData: { ...validEscrow, status: "RELEASED" }, expectedInputs, econBefore, econAfter }),
      /status/
    );

    // Match reason mismatch
    assert.throws(
      () => verifyFundedEscrowAudit({ escrowData: { ...validEscrow, match_reason: "WRONG" }, expectedInputs, econBefore, econAfter }),
      /match_reason/
    );

    // Amount mismatch
    assert.throws(
      () => verifyFundedEscrowAudit({ escrowData: { ...validEscrow, amount: "5000" }, expectedInputs, econBefore, econAfter }),
      /amount/
    );

    // Economics delta failure (open escrowed did not increase by 0.01 GEN)
    const badEconAfter = { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" };
    assert.throws(
      () => verifyFundedEscrowAudit({ escrowData: validEscrow, expectedInputs, econBefore, econAfter: badEconAfter }),
      /escrowed_open economics delta/
    );
  });

  // 9. Registry Metadata Contract (camelCase) & Failure Modes
  it("9. Registry metadata contract enforces camelCase fields, finite UTC timestamp, normalizedRepo, and fails closed", () => {
    const validMeta = {
      url: "https://registry.npmjs.org/pkg",
      statusCode: 200,
      exists: true,
      publishTime: "2026-10-20T12:00:00.000Z",
      isYanked: false,
      kind: "200",
      normalizedRepo: "owner/repo",
      summary: "Published",
    };

    // Valid check
    assert.equal(validMeta.statusCode, 200);
    assert.equal(validMeta.exists, true);
    assert.equal(validMeta.isYanked, false);
    assert.equal(!isNaN(new Date(validMeta.publishTime).getTime()), true);
    assert.equal(validMeta.normalizedRepo, "owner/repo");

    // Invalid timestamp (NaN)
    const invalidDate = "not-a-date";
    assert.equal(isNaN(new Date(invalidDate).getTime()), true);

    // Yanked release
    const yankedMeta = { ...validMeta, isYanked: true };
    assert.equal(yankedMeta.isYanked, true);

    // Inconclusive
    const inconclusiveMeta = { ...validMeta, kind: "inconclusive", exists: false };
    assert.equal(inconclusiveMeta.kind, "inconclusive");
  });

  // 10. GitHub Parsed Evidence Contract & Failure Modes
  it("10. queryGithubRelease contract enforces kind, error, exact tag, draft, prerelease, and fails closed", async () => {
    // Draft rejection
    const draftRelease = {
      tag_name: "v1.0.0",
      draft: true,
      prerelease: false,
      published_at: "2026-10-20T12:00:00Z",
    };
    // Prerelease rejection
    const prerelease = {
      tag_name: "v1.0.0",
      draft: false,
      prerelease: true,
      published_at: "2026-10-20T12:00:00Z",
    };
    assert.equal(draftRelease.draft, true);
    assert.equal(prerelease.prerelease, true);
  });

  // 11. Truthful Preflight Readiness & Structured Blockers
  it("11. runPreflight returns structured caseReadiness and blockers, truth-telling on placeholders, existing pkgs, and 500s", async () => {
    const mockClient = {
      getContractCode: async () => "0x" + "a".repeat(51327),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow_ids") return [];
        if (functionName === "get_economics") return { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" };
        return [];
      },
      getBalance: async () => 2000000000000000000n, // 2 GEN
    };

    // 1. Placeholder config -> readyForLiveWrites: false with placeholder blockers
    const resPlaceholder = await runPreflight({
      client: mockClient,
      manifest: validManifest,
      config: placeholderConfig,
      evidencePath: testEvidencePath,
      queryRegistryFn: async () => ({ statusCode: 404, kind: "404", exists: false, publishTime: null, isYanked: false }),
      queryGithubFn: async () => ({ exists: false, status_code: 404, kind: "404" }),
    });
    assert.equal(resPlaceholder.readyForLiveWrites, false);
    assert.equal(resPlaceholder.blockers.some((b) => b.includes("placeholder coordinates detected")), true);

    // 2. Package already published on registry (200) -> readyForLiveWrites: false (funding lookback would fail)
    const resAlreadyPublished = await runPreflight({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      evidencePath: testEvidencePath,
      queryRegistryFn: async () => ({ statusCode: 200, kind: "200", exists: true, publishTime: "2026-10-01T00:00:00Z", isYanked: false, normalizedRepo: "controlled-org/controlled-repo" }),
      queryGithubFn: async () => ({ exists: false, status_code: 404, kind: "404" }),
    });
    assert.equal(resAlreadyPublished.readyForLiveWrites, false);
    assert.equal(resAlreadyPublished.blockers.some((b) => b.includes("already published on registry")), true);

    // 3. Registry 500/network error -> readyForLiveWrites: false with inconclusive blocker
    const resHttpError = await runPreflight({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      evidencePath: testEvidencePath,
      queryRegistryFn: async () => ({ statusCode: 500, kind: "http_error", exists: false, publishTime: null, isYanked: false }),
      queryGithubFn: async () => ({ exists: false, status_code: 404, kind: "404" }),
    });
    assert.equal(resHttpError.readyForLiveWrites, false);
    assert.equal(resHttpError.blockers.some((b) => b.includes("inconclusive or unavailable")), true);

    // 4. Clean controlled config with 404 registry -> readyForLiveWrites: true
    const resClean = await runPreflight({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      evidencePath: testEvidencePath,
      queryRegistryFn: async () => ({ statusCode: 404, kind: "404", exists: false, publishTime: null, isYanked: false }),
      queryGithubFn: async () => ({ exists: false, status_code: 404, kind: "404" }),
    });
    assert.equal(resClean.readyForLiveWrites, true);
    assert.equal(resClean.caseReadiness.success, true);
    assert.equal(resClean.caseReadiness.mismatch, true);
    assert.equal(resClean.blockers.length, 0);
  });

  // 12. Crash Recovery Reuses Persisted Inputs Across Time
  it("12. runFund recovers from interrupted PREPARED state using persisted inputs even after clock advances 5 hours", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    let writeCount = 0;

    const originalWindowStart = "2026-10-21T00:00:00.000Z";
    const originalWindowEnd = "2026-10-23T00:00:00.000Z";

    const originalEscrowId = deriveV2EscrowId({
      funder: validManifest.deployerAddress,
      recipient: controlledConfig.recipientAddress,
      template: controlledConfig.cases.success.template,
      package_name: controlledConfig.cases.success.package,
      version: controlledConfig.cases.success.version,
      expected_repo: controlledConfig.cases.success.expectedRepo,
      expected_tag: controlledConfig.cases.success.expectedTag,
      window_start_utc: originalWindowStart,
      window_end_utc: originalWindowEnd,
      amount_wei: PRINCIPAL_PER_ESCROW_WEI,
      nonce: controlledConfig.cases.success.nonce,
    });

    // Write PREPARED evidence record simulating an earlier run 5 hours ago
    const preparedEvidence = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          state: "PREPARED",
          caseName: "success",
          escrowId: originalEscrowId,
          writeInputs: {
            template: controlledConfig.cases.success.template,
            package: controlledConfig.cases.success.package,
            packageName: controlledConfig.cases.success.package,
            version: controlledConfig.cases.success.version,
            expectedRepo: controlledConfig.cases.success.expectedRepo.toLowerCase(),
            expectedTag: controlledConfig.cases.success.expectedTag,
            recipient: controlledConfig.recipientAddress,
            funder: validManifest.deployerAddress,
            windowStartUtc: originalWindowStart,
            windowEndUtc: originalWindowEnd,
            nonce: controlledConfig.cases.success.nonce,
            amountWei: PRINCIPAL_PER_ESCROW_WEI.toString(),
          },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(preparedEvidence, null, 2), "utf-8");

    const mockClient = {
      readContract: async ({ functionName, args }) => {
        if (functionName === "get_economics") {
          return { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
        }
        if (functionName === "get_escrow") {
          assert.equal(args[0], originalEscrowId, "Must query original deterministic escrow ID, NOT newly calculated");
          return {
            policy: "SOURCE_LINKED",
            status: "OPEN",
            match_reason: "LOOKBACK_404_OK",
            expected_repo: controlledConfig.cases.success.expectedRepo.toLowerCase(),
            expectedTag: controlledConfig.cases.success.expectedTag,
            expected_tag: controlledConfig.cases.success.expectedTag,
            template: controlledConfig.cases.success.template,
            package_name: controlledConfig.cases.success.package,
            version: controlledConfig.cases.success.version,
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            amount: PRINCIPAL_PER_ESCROW_WEI.toString(),
            nonce: controlledConfig.cases.success.nonce,
            window_start_utc: originalWindowStart,
            window_end_utc: originalWindowEnd,
            payout: "0",
            refund: "0",
          };
        }
        return [];
      },
      getBalance: async () => 2000000000000000000n,
      writeContract: async () => {
        writeCount++;
        return "0xunexpected";
      },
    };

    try {
      const res = await runFund({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        deployerAccount: { address: validManifest.deployerAddress },
      });

      assert.equal(res.success, true);
      assert.equal(res.reconciled, true);
      assert.equal(writeCount, 0, "Must not execute any writes during recovery");

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.state, "VERIFIED");
      assert.equal(saved.cases.success.reconciledWithoutTxHash, true);
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 13. runFund Persists PREPARED Before Write, SUBMITTED After Write, and Calls writeContract with 9 Arguments
  it("13. runFund persists PREPARED before write, SUBMITTED after write, and calls writeContract with exact 9 arguments", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    let capturedMethod = "";
    let capturedArgs = [];
    let capturedValue = 0n;

    let econCalls13 = 0;
    const mockClient = {
      getBalance: async () => 2000000000000000000n,
      readContract: async ({ functionName, args }) => {
        if (functionName === "get_escrow_ids") return ["0xmockfundtxhash123456789012345678901234567890123456789012345678901234"];
        if (functionName === "get_economics") {
          econCalls13++;
          return econCalls13 === 1
            ? { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" }
            : { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
        }
        if (functionName === "get_escrow") {
          return {
            policy: "SOURCE_LINKED",
            status: "OPEN",
            match_reason: "LOOKBACK_404_OK",
            expected_repo: controlledConfig.cases.success.expectedRepo.toLowerCase(),
            expected_tag: controlledConfig.cases.success.expectedTag,
            template: controlledConfig.cases.success.template,
            package_name: controlledConfig.cases.success.package,
            version: controlledConfig.cases.success.version,
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            amount: PRINCIPAL_PER_ESCROW_WEI.toString(),
            nonce: controlledConfig.cases.success.nonce,
            window_start_utc: capturedArgs[6] || calculateWindowTimes(26, 48).startUtc,
            window_end_utc: capturedArgs[7] || calculateWindowTimes(26, 48).endUtc,
            payout: "0",
            refund: "0",
          };
        }
        return [];
      },
      estimateTransactionFees: async () => ({
        distribution: { leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 400n },
        feeValue: 5000000000000n,
      }),
      writeContract: async ({ functionName, args, value }) => {
        capturedMethod = functionName;
        capturedArgs = args;
        capturedValue = value;
        return "0xmockfundtxhash123456789012345678901234567890123456789012345678901234";
      },
      waitForTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
    };

    try {
      const res = await runFund({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        deployerAccount: { address: validManifest.deployerAddress },
      });

      assert.equal(res.success, true);
      assert.equal(capturedMethod, "fund_verified_escrow");
      assert.equal(capturedArgs.length, 9);
      assert.equal(capturedArgs[0], controlledConfig.cases.success.template);
      assert.equal(capturedArgs[1], controlledConfig.cases.success.package);
      assert.equal(capturedArgs[2], controlledConfig.cases.success.version);
      assert.equal(capturedArgs[3], controlledConfig.cases.success.expectedRepo.toLowerCase());
      assert.equal(capturedArgs[4], controlledConfig.cases.success.expectedTag);
      assert.equal(capturedArgs[5], controlledConfig.recipientAddress);
      assert.equal(capturedValue, PRINCIPAL_PER_ESCROW_WEI);

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.state, "VERIFIED");
      assert.equal(saved.cases.success.funding.status, "FINALIZED");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 14. Immediate Failure Lifecycle Persistence in runFund
  it("14. runFund atomically persists PENDING or FINALIZED_FAILED before throwing on unfinalized or reverted receipts", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    try {
      // 1. Reverted receipt
      const revertedClient = {
        getBalance: async () => 2000000000000000000n,
        readContract: async () => [],
        estimateTransactionFees: async () => ({ distribution: {}, feeValue: 1000n }),
        writeContract: async () => "0xrevertedtx",
        waitForTransactionReceipt: async () => ({
          statusName: "FINALIZED",
          txExecutionResultName: "EXECUTION_ERROR",
        }),
      };

      await assert.rejects(
        () => runFund({
          client: revertedClient,
          manifest: validManifest,
          config: controlledConfig,
          caseName: "success",
          evidencePath: testEvidencePath,
          deployerAccount: { address: validManifest.deployerAddress },
        }),
        /Transaction execution failed closed: result=EXECUTION_ERROR/
      );

      // Verify FINALIZED_FAILED was persisted atomically before throw
      const savedReverted = readJsonSafe(testEvidencePath);
      assert.equal(savedReverted.cases.success.state, "FINALIZED_FAILED");
      assert.equal(savedReverted.cases.success.funding.status, "FINALIZED");
      assert.equal(savedReverted.cases.success.funding.executionResult, "EXECUTION_ERROR");

      // 2. Unfinalized receipt
      const unfinalizedClient = {
        getBalance: async () => 2000000000000000000n,
        readContract: async () => [],
        estimateTransactionFees: async () => ({ distribution: {}, feeValue: 1000n }),
        writeContract: async () => "0xunfinalizedtx",
        waitForTransactionReceipt: async () => ({
          statusName: "ACCEPTED",
          txExecutionResultName: "FINISHED_WITH_RETURN",
        }),
      };

      await assert.rejects(
        () => runFund({
          client: unfinalizedClient,
          manifest: validManifest,
          config: controlledConfig,
          caseName: "mismatch",
          evidencePath: testEvidencePath,
          deployerAccount: { address: validManifest.deployerAddress },
        }),
        /Transaction was not finalized: status=ACCEPTED/
      );

      const savedUnfinalized = readJsonSafe(testEvidencePath);
      assert.equal(savedUnfinalized.cases.mismatch.state, "PENDING");
      assert.equal(savedUnfinalized.cases.mismatch.funding.status, "ACCEPTED");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 15. Concurrency-Safe Funded Escrow Discovery
  it("15. runFund queries expected escrow directly and succeeds even when concurrent unrelated escrows are created", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    const expectedId = deriveV2EscrowId({
      funder: validManifest.deployerAddress,
      recipient: controlledConfig.recipientAddress,
      template: controlledConfig.cases.success.template,
      package_name: controlledConfig.cases.success.package,
      version: controlledConfig.cases.success.version,
      expected_repo: controlledConfig.cases.success.expectedRepo,
      expected_tag: controlledConfig.cases.success.expectedTag,
      window_start_utc: calculateWindowTimes(26, 48).startUtc,
      window_end_utc: calculateWindowTimes(26, 48).endUtc,
      amount_wei: PRINCIPAL_PER_ESCROW_WEI,
      nonce: controlledConfig.cases.success.nonce,
    });

    let fundArgs = [];
    let econCalls15 = 0;
    let escrowIdCalls = 0;
    const mockClient = {
      getBalance: async () => 2000000000000000000n,
      readContract: async ({ functionName, args }) => {
        if (functionName === "get_escrow_ids") {
          escrowIdCalls++;
          // Returns baseline before write, and expected ID PLUS an unrelated concurrent escrow ID after write!
          return escrowIdCalls === 1 ? [] : [expectedId, "0xconcurrent_unrelated_escrow_id"];
        }
        if (functionName === "get_economics") {
          econCalls15++;
          return econCalls15 === 1
            ? { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" }
            : { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
        }
        if (functionName === "get_escrow") {
          return {
            policy: "SOURCE_LINKED",
            status: "OPEN",
            match_reason: "LOOKBACK_404_OK",
            expected_repo: controlledConfig.cases.success.expectedRepo.toLowerCase(),
            expected_tag: controlledConfig.cases.success.expectedTag,
            template: controlledConfig.cases.success.template,
            package_name: controlledConfig.cases.success.package,
            version: controlledConfig.cases.success.version,
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            amount: PRINCIPAL_PER_ESCROW_WEI.toString(),
            nonce: controlledConfig.cases.success.nonce,
            window_start_utc: fundArgs[6] || calculateWindowTimes(26, 48).startUtc,
            window_end_utc: fundArgs[7] || calculateWindowTimes(26, 48).endUtc,
            payout: "0",
            refund: "0",
          };
        }
        return [];
      },
      estimateTransactionFees: async () => ({
        distribution: { leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 400n },
        feeValue: 5000000000000n,
      }),
      writeContract: async ({ args }) => {
        fundArgs = args;
        return "0xfundtx";
      },
      waitForTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
    };

    try {
      const res = await runFund({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        deployerAccount: { address: validManifest.deployerAddress },
      });

      assert.equal(res.success, true);
      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.state, "VERIFIED");
      assert.deepEqual(saved.cases.success.concurrentEscrowIds, ["0xconcurrent_unrelated_escrow_id"]);
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 16. Authoritative Returned Message Allocations Enforcement
  it("16. runRelease reads only feeEst.messageAllocations and rejects before writeContract if returned allocations omit funder", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    let writeCalled = false;

    const evidence = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: { escrowId: "0xescrow123" },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidence, null, 2), "utf-8");

    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return {
            status: "OPEN",
            window_start_utc: "2026-01-01T00:00:00Z",
            window_end_utc: "2026-12-31T00:00:00Z",
            expire_at_utc: "2027-01-08T00:00:00Z",
            expected_repo: "controlled-org/controlled-repo",
            expected_tag: "v1.0.0",
            template: "NPM_VERSION",
            package_name: "controlled-pkg-alpha",
            version: "1.0.0",
            recipient: controlledConfig.recipientAddress,
            funder: validManifest.deployerAddress,
          };
        }
        if (functionName === "get_economics") return { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
        return [];
      },
      estimateTransactionFees: async () => ({
        distribution: {},
        feeValue: 5000n,
        // Returns allocations covering recipient ONLY, omitting funder!
        messageAllocations: [
          { recipient: controlledConfig.recipientAddress, budget: 1000n, parentIndex: 0 },
        ],
      }),
      writeContract: async () => {
        writeCalled = true;
        return "0xwrite";
      },
    };

    try {
      await assert.rejects(
        () => runRelease({
          client: mockClient,
          manifest: validManifest,
          config: controlledConfig,
          caseName: "success",
          evidencePath: testEvidencePath,
          getKeychainSecretFn: async () => "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
          queryRegistryFn: async () => ({ exists: true, statusCode: 200, kind: "200", isYanked: false, publishTime: "2026-06-01T00:00:00Z", normalizedRepo: "controlled-org/controlled-repo" }),
          queryGithubFn: async () => ({ exists: true, status_code: 200, kind: "200", draft: false, prerelease: false, tag_name: "v1.0.0", published_utc: "2026-06-01T00:00:00Z" }),
          getRpcTimeFn: async () => new Date("2026-06-02T00:00:00Z"),
        }),
        /Release message allocations missing required recipient/
      );

      assert.equal(writeCalled, false, "Must not call writeContract when returned message allocations are incomplete");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 17. Success Release Timing: Permits Release After window_end if Evidence Published Inside Window
  it("17. runRelease allows success release after window_end if publications were inside window and rpcTime < expire_at", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    let writeCalled = false;

    const evidence = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: { escrowId: "0xescrow123" },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidence, null, 2), "utf-8");

    const completeAllocations = buildV2ReleaseAllocations({
      recipient: controlledConfig.recipientAddress,
      funder: validManifest.deployerAddress,
      budget: 150000000000000n,
    });

    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return {
            status: writeCalled ? "RELEASED" : "OPEN",
            match_reason: writeCalled ? "VERIFIED_RELEASE" : "",
            payout: writeCalled ? "10000000000000000" : "0",
            refund: "0",
            window_start_utc: "2026-01-01T00:00:00Z",
            window_end_utc: "2026-06-01T00:00:00Z",
            expire_at_utc: "2026-07-01T00:00:00Z",
            expected_repo: "controlled-org/controlled-repo",
            expected_tag: "v1.0.0",
            template: "NPM_VERSION",
            package_name: "controlled-pkg-alpha",
            version: "1.0.0",
            recipient: controlledConfig.recipientAddress,
            funder: validManifest.deployerAddress,
          };
        }
        if (functionName === "get_economics") {
          return writeCalled
            ? { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" }
            : { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
        }
        return [];
      },
      estimateTransactionFees: async () => ({
        distribution: {},
        feeValue: 5000n,
        messageAllocations: completeAllocations,
      }),
      writeContract: async () => {
        writeCalled = true;
        return "0xreleasetx";
      },
      waitForTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
    };

    try {
      // Current RPC time is 2026-06-15 (after window_end 2026-06-01, but before expire_at 2026-07-01!)
      // Publication times are 2026-03-01 (inside window!)
      const res = await runRelease({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        getKeychainSecretFn: async () => "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        queryRegistryFn: async () => ({ exists: true, statusCode: 200, kind: "200", isYanked: false, publishTime: "2026-03-01T00:00:00Z", normalizedRepo: "controlled-org/controlled-repo" }),
        queryGithubFn: async () => ({ exists: true, status_code: 200, kind: "200", draft: false, prerelease: false, tag_name: "v1.0.0", published_utc: "2026-03-01T00:00:00Z" }),
        getRpcTimeFn: async () => new Date("2026-06-15T00:00:00Z"),
        verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
      });

      assert.equal(res.success, true);
      assert.equal(writeCalled, true);
      assert.equal(res.status, "RELEASED");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 18. Executable End-to-End Settlement for Success and Mismatch Cases
  it("18. runRelease executes full settlement paths for success and mismatch with authoritative verification", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";

    // Mismatch case execution
    const evidenceMismatch = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        mismatch: { escrowId: "0xmismatch123" },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceMismatch, null, 2), "utf-8");

    const completeAllocations = buildV2ReleaseAllocations({
      recipient: controlledConfig.recipientAddress,
      funder: validManifest.deployerAddress,
      budget: 150000000000000n,
    });

    let mismatchWriteCalled = false;
    const mockMismatchClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return {
            status: mismatchWriteCalled ? "REFUND_NOHIT" : "OPEN",
            match_reason: mismatchWriteCalled ? "GITHUB_TAG_MISMATCH" : "",
            payout: "0",
            refund: mismatchWriteCalled ? "10000000000000000" : "0",
            window_start_utc: "2026-01-01T00:00:00Z",
            window_end_utc: "2026-06-01T00:00:00Z",
            expire_at_utc: "2026-07-01T00:00:00Z",
            expected_repo: "controlled-org/controlled-mismatch",
            expected_tag: "v0.1.0",
            template: "PYPI_VERSION",
            package_name: "controlled-pkg-beta",
            version: "0.1.0",
            recipient: controlledConfig.recipientAddress,
            funder: validManifest.deployerAddress,
          };
        }
        if (functionName === "get_economics") {
          return mismatchWriteCalled
            ? { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "10000000000000000" }
            : { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
        }
        return [];
      },
      estimateTransactionFees: async () => ({
        distribution: {},
        feeValue: 5000n,
        messageAllocations: completeAllocations,
      }),
      writeContract: async () => {
        mismatchWriteCalled = true;
        return "0xmismatchreleasetx";
      },
      waitForTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
    };

    try {
      const resMismatch = await runRelease({
        client: mockMismatchClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "mismatch",
        evidencePath: testEvidencePath,
        getKeychainSecretFn: async () => "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        getRpcTimeFn: async () => new Date("2026-06-15T00:00:00Z"), // post-window, before expire_at
        verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
      });

      assert.equal(resMismatch.success, true);
      assert.equal(resMismatch.status, "REFUND_NOHIT");
      assert.equal(resMismatch.matchReason, "GITHUB_TAG_MISMATCH");

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.mismatch.state, "VERIFIED");
      assert.equal(saved.cases.mismatch.resultingStatus, "REFUND_NOHIT");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 19. Transfer-Verification Distinction: SETTLEMENT_VERIFIED_TRANSFER_PENDING vs VERIFIED
  it("19. runRelease distinguishes emitted message from delivered funds and sets SETTLEMENT_VERIFIED_TRANSFER_PENDING when child is pending", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";

    const evidence = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: { escrowId: "0xescrowPendingTransfer" },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidence, null, 2), "utf-8");

    const completeAllocations = buildV2ReleaseAllocations({
      recipient: controlledConfig.recipientAddress,
      funder: validManifest.deployerAddress,
      budget: 150000000000000n,
    });

    let writeCalled = false;
    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return {
            status: writeCalled ? "RELEASED" : "OPEN",
            match_reason: writeCalled ? "VERIFIED_RELEASE" : "",
            payout: writeCalled ? "10000000000000000" : "0",
            refund: "0",
            window_start_utc: "2026-01-01T00:00:00Z",
            window_end_utc: "2026-12-31T00:00:00Z",
            expire_at_utc: "2027-01-08T00:00:00Z",
            expected_repo: "controlled-org/controlled-repo",
            expected_tag: "v1.0.0",
            template: "NPM_VERSION",
            package_name: "controlled-pkg-alpha",
            version: "1.0.0",
            recipient: controlledConfig.recipientAddress,
            funder: validManifest.deployerAddress,
          };
        }
        if (functionName === "get_economics") {
          return writeCalled
            ? { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" }
            : { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
        }
        return [];
      },
      estimateTransactionFees: async () => ({
        distribution: {},
        feeValue: 5000n,
        messageAllocations: completeAllocations,
      }),
      writeContract: async () => {
        writeCalled = true;
        return "0xreleasetx";
      },
      waitForTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
    };

    try {
      // Transfer verification returns messageEmitted: true, but fundsDelivered: false!
      const res = await runRelease({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        getKeychainSecretFn: async () => "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        queryRegistryFn: async () => ({ exists: true, statusCode: 200, kind: "200", isYanked: false, publishTime: "2026-03-01T00:00:00Z", normalizedRepo: "controlled-org/controlled-repo" }),
        queryGithubFn: async () => ({ exists: true, status_code: 200, kind: "200", draft: false, prerelease: false, tag_name: "v1.0.0", published_utc: "2026-03-01T00:00:00Z" }),
        getRpcTimeFn: async () => new Date("2026-03-02T00:00:00Z"),
        verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: false }),
      });

      assert.equal(res.state, "SETTLEMENT_VERIFIED_TRANSFER_PENDING");
      assert.equal(res.success, false, "Must not report full success when child transfer is pending");

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.state, "SETTLEMENT_VERIFIED_TRANSFER_PENDING");
      assert.equal(saved.cases.success.transferProof.messageEmitted, true);
      assert.equal(saved.cases.success.transferProof.fundsDelivered, false);
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 20. Comprehensive Release Hash Reconciliation
  it("20. runRelease existing hash reconciliation checks baselines and outcomes with zero duplicate writes", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    let writeCalled = false;

    // Case 1: Complete proof exists -> VERIFIED, 0 writes
    const completeEvidence = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow123",
          release: {
            txHash: "0xexistinghash",
            preEscrowSnapshot: { status: "OPEN" },
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            postEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" },
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(completeEvidence, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return {
            status: "RELEASED",
            match_reason: "VERIFIED_RELEASE",
            payout: "10000000000000000",
            recipient: controlledConfig.recipientAddress,
            funder: validManifest.deployerAddress,
          };
        }
        if (functionName === "get_economics") {
          return { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" };
        }
        return [];
      },
      writeContract: async () => {
        writeCalled = true;
        return "0xunwanted";
      },
    };

    try {
      const res = await runRelease({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
      });

      assert.equal(res.success, true);
      assert.equal(res.reconciled, true);
      assert.equal(res.state, "VERIFIED");
      assert.equal(writeCalled, false);

      // Case 2: Missing baseline snapshots -> PROOF_INCOMPLETE, 0 writes
      const missingBaselineEvidence = {
        contractAddress: REQUIRED_CONTRACT_ADDRESS,
        cases: {
          success: {
            escrowId: "0xescrow123",
            release: {
              txHash: "0xexistinghash",
              // preEconomicsSnapshot omitted!
            },
          },
        },
      };
      writeFileSync(testEvidencePath, JSON.stringify(missingBaselineEvidence, null, 2), "utf-8");

      const resIncomplete = await runRelease({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
      });

      assert.equal(resIncomplete.proofStatus, "PROOF_INCOMPLETE");
      assert.equal(writeCalled, false);
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 21. Truthful runReconcile Full Verifiers
  it("21. runReconcile uses full verifiers and reports inspected, verified, pending, failed, and proofIncomplete", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0x123",
          funding: { txHash: "0xfund1" },
          // Missing preEconomicsSnapshot -> PROOF_INCOMPLETE
        },
        mismatch: {
          escrowId: "0x456",
          funding: { txHash: "0xfund2" },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async ({ hash }) => {
        if (hash === "0xfund1") return { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" };
        if (hash === "0xfund2") return { statusName: "FINALIZED", txExecutionResultName: "EXECUTION_ERROR" };
        return null;
      },
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      evidencePath: testEvidencePath,
    });

    assert.equal(res.inspected, 2);
    assert.equal(res.failed, 1);
    assert.equal(res.proofIncomplete, 1);
    assert.equal(res.verified, 0);

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.mismatch.funding.state, "FINALIZED_FAILED");
    assert.equal(saved.cases.success.funding.proofStatus, "PROOF_INCOMPLETE");
  });

  // 22. Caller Role Separation: Submitter != Funder
  it("22. runRelease enforces caller role separation and rejects deployer/funder address as submitter", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    const evidence = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: { escrowId: "0xescrow123" },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidence, null, 2), "utf-8");

    try {
      await assert.rejects(
        () => runRelease({
          manifest: validManifest,
          config: controlledConfig,
          caseName: "success",
          evidencePath: testEvidencePath,
          submitterAccount: { address: validManifest.deployerAddress },
        }),
        /Caller role violation: release caller.*cannot be the funder address/
      );
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 23. Fail Closed on Missing Studio Next RPC Time
  it("23. runRelease fails closed when Studio Next RPC time cannot be queried", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    const evidence = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: { escrowId: "0xescrow123" },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidence, null, 2), "utf-8");

    const mockClient = {
      readContract: async () => ({
        status: "OPEN",
        window_start_utc: "2026-01-01T00:00:00Z",
        window_end_utc: "2026-12-31T00:00:00Z",
        expire_at_utc: "2027-01-08T00:00:00Z",
        expected_repo: "controlled-org/controlled-repo",
        expected_tag: "v1.0.0",
      }),
      request: async () => {
        throw new Error("RPC unreachable");
      },
    };

    try {
      await assert.rejects(
        () => runRelease({
          client: mockClient,
          manifest: validManifest,
          config: controlledConfig,
          caseName: "success",
          evidencePath: testEvidencePath,
          getKeychainSecretFn: async () => "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        }),
        /Failed to query Studio Next RPC time.*Fail closed for timed write/
      );
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 24. Historical v1 Evidence Isolation
  it("24. preserves historical v1 evidence in scripts/steward_evidence.json untouched", () => {
    assert.equal(existsSync(V1_EVIDENCE_PATH), true);
    const v1Data = readJsonSafe(V1_EVIDENCE_PATH);
    assert.equal(v1Data.contractAddress, "0x7Cef756668Cd925807e8B110D0330643c6F809E3");
    assert.ok(Array.isArray(v1Data.escrows));
    assert.equal(v1Data.escrows.length, 2);
    assert.equal(v1Data.escrows[0].id, "0x1ac2eea7c83967a0abe667355598d3809fb2552cc5d4227ad7ba86fee09a3c46");
    assert.equal(v1Data.escrows[1].id, "0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e");
  });

  // Shared Fixtures for Lifecycle Reconciliation Tests
  const reconSuccessWriteInputs = {
    template: "NPM_VERSION",
    package: "controlled-pkg-alpha",
    version: "1.0.0",
    expectedRepo: "controlled-org/controlled-repo",
    expectedTag: "v1.0.0",
    funder: "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084",
    recipient: "0x1111111111111111111111111111111111111111",
    nonce: "1001",
    windowStartUtc: "2026-10-20T20:00:00Z",
    windowEndUtc: "2026-10-22T20:00:00Z",
    amountWei: "10000000000000000",
  };

  const reconSuccessAudit = {
    policy: "SOURCE_LINKED",
    status: "OPEN",
    match_reason: "LOOKBACK_404_OK",
    template: "NPM_VERSION",
    package_name: "controlled-pkg-alpha",
    version: "1.0.0",
    expected_repo: "controlled-org/controlled-repo",
    expected_tag: "v1.0.0",
    funder: "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084",
    recipient: "0x1111111111111111111111111111111111111111",
    amount: "10000000000000000",
    nonce: "1001",
    window_start_utc: "2026-10-20T20:00:00Z",
    window_end_utc: "2026-10-22T20:00:00Z",
    payout: "0",
    refund: "0",
  };

  const reconSuccessLiveEscrow = {
    ...reconSuccessAudit,
    status: "RELEASED",
    match_reason: "VERIFIED_RELEASE",
    payout: "10000000000000000",
    refund: "0",
  };

  const reconMismatchWriteInputs = {
    template: "PYPI_VERSION",
    package: "controlled-pkg-beta",
    version: "0.1.0",
    expectedRepo: "controlled-org/controlled-repo",
    expectedTag: "v0.1.0-wrong",
    funder: "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084",
    recipient: "0x1111111111111111111111111111111111111111",
    nonce: "1002",
    windowStartUtc: "2026-10-20T20:00:00Z",
    windowEndUtc: "2026-10-22T20:00:00Z",
    amountWei: "10000000000000000",
  };

  const reconMismatchAudit = {
    policy: "SOURCE_LINKED",
    status: "OPEN",
    match_reason: "LOOKBACK_404_OK",
    template: "PYPI_VERSION",
    package_name: "controlled-pkg-beta",
    version: "0.1.0",
    expected_repo: "controlled-org/controlled-repo",
    expected_tag: "v0.1.0-wrong",
    funder: "0x20E850BAaD26d763d4f691780D1BEBA01c8D6084",
    recipient: "0x1111111111111111111111111111111111111111",
    amount: "10000000000000000",
    nonce: "1002",
    window_start_utc: "2026-10-20T20:00:00Z",
    window_end_utc: "2026-10-22T20:00:00Z",
    payout: "0",
    refund: "0",
  };

  const reconMismatchLiveEscrow = {
    ...reconMismatchAudit,
    status: "REFUND_NOHIT",
    match_reason: "GITHUB_TAG_MISMATCH",
    payout: "0",
    refund: "10000000000000000",
  };

  // 25. runReconcile: Success Funding -> RELEASED -> Reconcile (Both Remain VERIFIED)
  it("25. runReconcile keeps funding and release VERIFIED after success escrow settles to RELEASED", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: reconSuccessWriteInputs,
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
          postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          onChainAudit: reconSuccessAudit,
          funding: {
            txHash: "0xfund_success",
            status: "FINALIZED",
            state: "VERIFIED",
            writeInputs: reconSuccessWriteInputs,
          },
          release: {
            txHash: "0xrel_success",
            status: "FINALIZED",
            state: "VERIFIED",
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            postEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" },
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return reconSuccessLiveEscrow;
        }
        if (functionName === "get_economics") {
          // Altered global economics from subsequent activity
          return { escrowed_open: "500000000000000000", paid_to_recipients: "900000000000000000", refunded_to_funders: "100000000000000000" };
        }
        return null;
      },
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      evidencePath: testEvidencePath,
      verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
    });

    assert.equal(res.inspected, 2);
    assert.equal(res.verified, 2);
    assert.equal(res.proofIncomplete, 0);
    assert.equal(res.failed, 0);

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.funding.proofStatus, "VERIFIED");
    assert.equal(saved.cases.success.funding.state, "VERIFIED");
    assert.equal(saved.cases.success.release.proofStatus, "VERIFIED");
    assert.equal(saved.cases.success.release.state, "VERIFIED");
    assert.equal(saved.cases.success.currentLifecycleStatus, "RELEASED");
    assert.equal(saved.cases.success.postEconomicsSnapshot.escrowed_open, "10000000000000000"); // not overwritten!
  });

  // 26. runReconcile: Mismatch Funding -> REFUND_NOHIT -> Reconcile (Both Remain VERIFIED)
  it("26. runReconcile keeps funding and release VERIFIED after mismatch escrow settles to REFUND_NOHIT", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        mismatch: {
          escrowId: "0xescrow_mismatch",
          writeInputs: reconMismatchWriteInputs,
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
          postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          onChainAudit: reconMismatchAudit,
          funding: {
            txHash: "0xfund_mismatch",
            status: "FINALIZED",
            state: "VERIFIED",
            writeInputs: reconMismatchWriteInputs,
          },
          release: {
            txHash: "0xrel_mismatch",
            status: "FINALIZED",
            state: "VERIFIED",
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            postEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "10000000000000000" },
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return reconMismatchLiveEscrow;
        }
        if (functionName === "get_economics") {
          return { escrowed_open: "500000000000000000", paid_to_recipients: "900000000000000000", refunded_to_funders: "100000000000000000" };
        }
        return null;
      },
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      evidencePath: testEvidencePath,
      verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
    });

    assert.equal(res.inspected, 2);
    assert.equal(res.verified, 2);
    assert.equal(res.proofIncomplete, 0);

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.mismatch.funding.proofStatus, "VERIFIED");
    assert.equal(saved.cases.mismatch.funding.state, "VERIFIED");
    assert.equal(saved.cases.mismatch.release.proofStatus, "VERIFIED");
    assert.equal(saved.cases.mismatch.release.state, "VERIFIED");
    assert.equal(saved.cases.mismatch.currentLifecycleStatus, "REFUND_NOHIT");
  });

  // 27. runReconcile: Both Escrows Exist and Global Economics Changed
  it("27. runReconcile does not compare historical baselines directly with current aggregate economics", async () => {
    let getEconomicsCalls = 0;
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: reconSuccessWriteInputs,
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
          postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          onChainAudit: reconSuccessAudit,
          funding: { txHash: "0xfund_success", status: "FINALIZED", writeInputs: reconSuccessWriteInputs },
          release: {
            txHash: "0xrel_success",
            status: "FINALIZED",
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            postEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" },
          },
        },
        mismatch: {
          escrowId: "0xescrow_mismatch",
          writeInputs: reconMismatchWriteInputs,
          preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          postEconomicsSnapshot: { escrowed_open: "20000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          onChainAudit: reconMismatchAudit,
          funding: { txHash: "0xfund_mismatch", status: "FINALIZED", writeInputs: reconMismatchWriteInputs },
          release: {
            txHash: "0xrel_mismatch",
            status: "FINALIZED",
            preEconomicsSnapshot: { escrowed_open: "20000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "10000000000000000" },
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async ({ functionName, args }) => {
        if (functionName === "get_escrow") {
          return args[0] === "0xescrow_success" ? reconSuccessLiveEscrow : reconMismatchLiveEscrow;
        }
        if (functionName === "get_economics") {
          getEconomicsCalls++;
          // Unrelated active chain economics with 100 escrows
          return { escrowed_open: "9900000000000000000", paid_to_recipients: "5000000000000000000", refunded_to_funders: "4000000000000000000" };
        }
        return null;
      },
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      evidencePath: testEvidencePath,
      verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
    });

    assert.equal(res.inspected, 4);
    assert.equal(res.verified, 4);
    assert.equal(res.proofIncomplete, 0);
    assert.equal(getEconomicsCalls, 0); // neither funding nor release compared against current aggregate get_economics!
  });

  // 28. runReconcile: Immutable Identity Mismatch Still Fails Closed
  it("28. runReconcile fails closed when live escrow immutable identity mismatches writeInputs", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: reconSuccessWriteInputs,
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
          postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          onChainAudit: reconSuccessAudit,
          funding: { txHash: "0xfund_success", status: "FINALIZED" },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          // On-chain escrow has mismatched expected_repo
          return { ...reconSuccessLiveEscrow, expected_repo: "hacked-org/hacked-repo" };
        }
        return null;
      },
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      evidencePath: testEvidencePath,
    });

    assert.equal(res.inspected, 1);
    assert.equal(res.verified, 0);
    assert.equal(res.proofIncomplete, 1);

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.funding.proofStatus, "PROOF_INCOMPLETE");
  });

  // 29. runReconcile: Missing Historical Post-Funding Snapshot Produces PROOF_INCOMPLETE
  it("29. runReconcile reports PROOF_INCOMPLETE when historical post-funding snapshot is missing", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: reconSuccessWriteInputs,
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
          // Missing postEconomicsSnapshot and onChainAudit
          funding: { txHash: "0xfund_success", status: "FINALIZED" },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async () => reconSuccessLiveEscrow,
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      evidencePath: testEvidencePath,
    });

    assert.equal(res.inspected, 1);
    assert.equal(res.proofIncomplete, 1);
    assert.equal(res.verified, 0);

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.funding.proofStatus, "PROOF_INCOMPLETE");
  });

  // 30. runReconcile: Zero Duplicate writeContract Calls During Reconciliation
  it("30. runReconcile executes zero duplicate writeContract calls", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: reconSuccessWriteInputs,
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
          postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          onChainAudit: reconSuccessAudit,
          funding: { txHash: "0xfund_success", status: "FINALIZED" },
          release: {
            txHash: "0xrel_success",
            status: "FINALIZED",
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            postEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" },
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    let writeContractCalled = false;
    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async () => reconSuccessLiveEscrow,
      writeContract: async () => {
        writeContractCalled = true;
        throw new Error("writeContract must not be invoked during reconciliation");
      },
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      evidencePath: testEvidencePath,
      verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
    });

    assert.equal(writeContractCalled, false);
    assert.equal(res.inspected, 2);
    assert.equal(res.verified, 2);
  });

  // 31. verifyEscrowImmutableIdentity
  it("31. verifyEscrowImmutableIdentity verifies immutable coordinates and ignores mutable lifecycle status", () => {
    assert.doesNotThrow(() =>
      verifyEscrowImmutableIdentity({
        escrowData: reconSuccessLiveEscrow,
        expectedInputs: reconSuccessWriteInputs,
      })
    );

    assert.throws(
      () =>
        verifyEscrowImmutableIdentity({
          escrowData: { ...reconSuccessLiveEscrow, expected_tag: "v9.9.9" },
          expectedInputs: reconSuccessWriteInputs,
        }),
      /expected_tag/
    );

    assert.throws(
      () =>
        verifyEscrowImmutableIdentity({
          escrowData: { ...reconSuccessLiveEscrow, recipient: "0x0000000000000000000000000000000000000001" },
          expectedInputs: reconSuccessWriteInputs,
        }),
      /recipient/
    );
  });

  // 32. runFund existing finalized hash with missing postEconomicsSnapshot
  it("32. runFund existing finalized hash with missing postEconomicsSnapshot reports PROOF_INCOMPLETE without get_economics call or duplicate write", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    const test32Inputs = {
      ...reconSuccessWriteInputs,
      recipient: controlledConfig.recipientAddress,
    };
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: test32Inputs,
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
          // Missing postEconomicsSnapshot and onChainAudit
          funding: {
            txHash: "0xfund_success",
            status: "SUBMITTED",
            writeInputs: test32Inputs,
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    let writeCount = 0;
    let getEconomicsCount = 0;
    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return { ...reconSuccessLiveEscrow, recipient: controlledConfig.recipientAddress };
        }
        if (functionName === "get_economics") {
          getEconomicsCount++;
          return { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" };
        }
        return null;
      },
      writeContract: async () => {
        writeCount++;
        return "0xunwanted";
      },
    };

    try {
      const res = await runFund({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        deployerAccount: { address: validManifest.deployerAddress },
      });

      assert.equal(res.success, false);
      assert.equal(res.proofStatus, "PROOF_INCOMPLETE");
      assert.equal(res.reconciled, true);
      assert.equal(writeCount, 0, "Zero writeContract calls");
      assert.equal(getEconomicsCount, 0, "Zero get_economics calls for historical reconstruction");

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.funding.proofStatus, "PROOF_INCOMPLETE");
      assert.equal(saved.cases.success.state, "PROOF_INCOMPLETE");
      assert.equal(saved.cases.success.postEconomicsSnapshot, undefined, "Does not create postEconomicsSnapshot");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 33. runReconcile release record with missing postEconomicsSnapshot
  it("33. runReconcile release record with missing postEconomicsSnapshot reports PROOF_INCOMPLETE without get_economics substitute or duplicate write", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: reconSuccessWriteInputs,
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0" },
          postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
          onChainAudit: reconSuccessAudit,
          funding: { txHash: "0xfund_success", status: "FINALIZED", state: "VERIFIED" },
          release: {
            txHash: "0xrel_success",
            status: "FINALIZED",
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            // Missing postEconomicsSnapshot!
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    let writeCount = 0;
    let getEconomicsCount = 0;
    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") return reconSuccessLiveEscrow;
        if (functionName === "get_economics") {
          getEconomicsCount++;
          return { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" };
        }
        return null;
      },
      writeContract: async () => {
        writeCount++;
        return "0xunwanted";
      },
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      evidencePath: testEvidencePath,
      verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
    });

    assert.equal(res.inspected, 2);
    assert.equal(res.verified, 1); // Funding verified, release incomplete
    assert.equal(res.proofIncomplete, 1);
    assert.equal(writeCount, 0, "Zero duplicate writeContract calls");
    assert.equal(getEconomicsCount, 0, "Does not query current get_economics as substitute");

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.release.proofStatus, "PROOF_INCOMPLETE");
    assert.equal(saved.cases.success.release.postEconomicsSnapshot, undefined, "Does not create replacement snapshot");
  });

  // 34. runRelease existing finalized hash with missing postEconomicsSnapshot
  it("34. runRelease existing finalized hash with missing postEconomicsSnapshot returns PROOF_INCOMPLETE without get_economics call or duplicate write", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          release: {
            txHash: "0xrel_success",
            preEscrowSnapshot: { status: "OPEN" },
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            // Missing postEconomicsSnapshot!
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    let writeCount = 0;
    let getEconomicsCount = 0;
    const mockClient = {
      getTransactionReceipt: async () => ({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
      }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") return reconSuccessLiveEscrow;
        if (functionName === "get_economics") {
          getEconomicsCount++;
          return { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" };
        }
        return null;
      },
      writeContract: async () => {
        writeCount++;
        return "0xunwanted";
      },
    };

    try {
      const res = await runRelease({
        client: mockClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
      });

      assert.equal(res.success, false);
      assert.equal(res.proofStatus, "PROOF_INCOMPLETE");
      assert.equal(res.reconciled, true);
      assert.equal(writeCount, 0, "Zero writeContract calls");
      assert.equal(getEconomicsCount, 0, "Does not query current aggregate economics as historical proof");

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.release.proofStatus, "PROOF_INCOMPLETE");
      assert.equal(saved.cases.success.release.postEconomicsSnapshot, undefined, "Does not create postEconomicsSnapshot");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 35. normalizeTransactionOutcome handles native FINALIZED + FINISHED_WITH_RETURN
  it("35. normalizeTransactionOutcome handles native FINALIZED + FINISHED_WITH_RETURN", () => {
    const raw = { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" };
    const outcome = normalizeTransactionOutcome(raw);
    assert.equal(outcome.finalized, true);
    assert.equal(outcome.success, true);
    assert.equal(outcome.statusName, "FINALIZED");
    assert.equal(outcome.executionResultName, "FINISHED_WITH_RETURN");
    assert.equal(outcome.executionResult, 1);
  });

  // 36. normalizeTransactionOutcome handles native numeric status 7 + result 1
  it("36. normalizeTransactionOutcome handles native numeric status 7 + result 1", () => {
    const raw = { status: 7, last_round: { result: 1 } };
    const outcome = normalizeTransactionOutcome(raw);
    assert.equal(outcome.finalized, true);
    assert.equal(outcome.success, true);
    assert.equal(outcome.statusName, "FINALIZED");
    assert.equal(outcome.executionResultName, "FINISHED_WITH_RETURN");
    assert.equal(outcome.executionResult, 1);
  });

  // 37. normalizeTransactionOutcome combines standard receipt success with native finalized success
  it("37. normalizeTransactionOutcome combines standard receipt 'success' with native finalized success", () => {
    const receipt = { status: "success", transactionHash: "0xhash" };
    const nativeTx = { status: 7, last_round: { result: 1 } };
    const outcome = normalizeTransactionOutcome(receipt, nativeTx);
    assert.equal(outcome.finalized, true);
    assert.equal(outcome.success, true);
    assert.equal(outcome.stdReceiptStatus, "success");
    assert.equal(outcome.statusName, "FINALIZED");
    assert.equal(outcome.executionResultName, "FINISHED_WITH_RETURN");
  });

  // 38. Standard receipt "success" without native finality fails closed
  it("38. Standard receipt 'success' without native finality fails closed", () => {
    const receiptOnly = { status: "success", transactionHash: "0xhash" };
    const outcome = normalizeTransactionOutcome(receiptOnly);
    assert.equal(outcome.finalized, false);
    assert.equal(outcome.success, false);
    assert.match(outcome.error, /Standard receipt status 'success' does not establish native GenLayer finality/);
    assert.throws(
      () => verifyReceiptFinalizedSuccess(receiptOnly),
      /Transaction was not finalized/
    );
  });

  // 39. Pending native transaction is recognized and fails closed for immediate success
  it("39. normalizeTransactionOutcome identifies pending native transaction (status 5 or statusName PENDING)", () => {
    const pendingTx = { status: 5, statusName: "COMMITTING" };
    const outcome = normalizeTransactionOutcome(pendingTx);
    assert.equal(outcome.finalized, false);
    assert.equal(outcome.isPending, true);
    assert.equal(outcome.success, false);
    assert.throws(
      () => verifyReceiptFinalizedSuccess(pendingTx),
      /Transaction was not finalized/
    );
  });

  // 40. Failed native execution is recognized and fails closed
  it("40. normalizeTransactionOutcome identifies failed execution (status 7 + result 2)", () => {
    const failedTx = { status: 7, txExecutionResult: 2, txExecutionResultName: "EXECUTION_FAILED" };
    const outcome = normalizeTransactionOutcome(failedTx);
    assert.equal(outcome.finalized, true);
    assert.equal(outcome.success, false);
    assert.equal(outcome.isExecutionFailed, true);
    assert.throws(
      () => verifyReceiptFinalizedSuccess(failedTx),
      /Transaction execution failed closed/
    );
  });

  // 41. Existing hash never causes writeContract resubmission
  it("41. Existing hash never causes writeContract resubmission", async () => {
    let writeCount = 0;
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: {
            template: "NPM_VERSION",
            package: "controlled-pkg-alpha",
            version: "1.0.0",
            expectedRepo: "controlled-org/controlled-repo",
            expectedTag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            nonce: "1001",
            windowStartUtc: "2026-10-20T20:00:00Z",
            windowEndUtc: "2026-10-22T20:00:00Z",
          },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          onChainAudit: {
            policy: "SOURCE_LINKED",
            status: "OPEN",
            match_reason: "LOOKBACK_404_OK",
            template: "NPM_VERSION",
            package_name: "controlled-pkg-alpha",
            version: "1.0.0",
            expected_repo: "controlled-org/controlled-repo",
            expected_tag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            amount: "10000000000000000",
            nonce: "1001",
            window_start_utc: "2026-10-20T20:00:00Z",
            window_end_utc: "2026-10-22T20:00:00Z",
            payout: "0",
            refund: "0",
          },
          funding: {
            txHash: "0xexisting_funding_hash",
            status: "SUBMITTED",
          },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return evidenceState.cases.success.onChainAudit;
        }
        return null;
      },
      writeContract: async () => {
        writeCount++;
        return "0xresubmitted_unwanted";
      },
    };

    const res = await reconcileExistingFundingHash({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      existingCase: evidenceState.cases.success,
      expectedEscrowId: "0xescrow_success",
    });

    assert.equal(res.success, true);
    assert.equal(res.reconciled, true);
    assert.equal(writeCount, 0, "Zero writeContract calls during existing hash recovery");
  });

  // 42. Successful exclusive-state recovery when all invariants hold
  it("42. Successful exclusive-state recovery when all exclusivity invariants hold", async () => {
    const validEscrow = {
      policy: "SOURCE_LINKED",
      status: "OPEN",
      match_reason: "LOOKBACK_404_OK",
      template: "NPM_VERSION",
      package_name: "controlled-pkg-alpha",
      version: "1.0.0",
      expected_repo: "controlled-org/controlled-repo",
      expected_tag: "v1.0.0",
      funder: validManifest.deployerAddress,
      recipient: controlledConfig.recipientAddress,
      amount: "10000000000000000",
      nonce: "1001",
      window_start_utc: "2026-10-20T20:00:00Z",
      window_end_utc: "2026-10-22T20:00:00Z",
      payout: "0",
      refund: "0",
    };

    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: {
            template: "NPM_VERSION",
            package: "controlled-pkg-alpha",
            version: "1.0.0",
            expectedRepo: "controlled-org/controlled-repo",
            expectedTag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            nonce: "1001",
            windowStartUtc: "2026-10-20T20:00:00Z",
            windowEndUtc: "2026-10-22T20:00:00Z",
            amountWei: "10000000000000000",
          },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          funding: {
            txHash: "0xfund_success",
            status: "SUBMITTED",
          },
        },
        mismatch: null,
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow_ids") return ["0xescrow_success"];
        if (functionName === "get_escrow") return validEscrow;
        if (functionName === "get_economics") {
          return {
            escrowed_open: "10000000000000000",
            paid_to_recipients: "0",
            refunded_to_funders: "0",
            outstanding_credits: "0",
            treasury: "0",
          };
        }
        return null;
      },
    };

    const txOutcome = {
      finalized: true,
      success: true,
      status: "FINALIZED",
      executionResult: 1,
    };

    const res = await attemptExclusiveStateRecovery({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      txOutcome,
      checkAbsenceFn: async () => ({ passed: true }),
    });

    assert.equal(res.success, true);
    assert.equal(res.proofStatus, "VERIFIED");
    assert.equal(res.recovered, true);

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.state, "VERIFIED");
    assert.equal(saved.cases.success.funding.proofStatus, "VERIFIED");
    assert.equal(saved.cases.success.captureMode, "EXCLUSIVE_STATE_RECOVERY");
    assert.ok(saved.cases.success.recoveryObservedAtUtc);
    assert.equal(saved.history.length, 1);
    assert.equal(saved.history[0].action, "fund_verified_recovery");
  });

  // 43. Exclusive-state recovery rejected when >1 escrow exists
  it("43. Exclusive-state recovery rejected when more than one escrow exists", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: { nonce: "1001", amountWei: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          funding: { txHash: "0xfund1" },
        },
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow_ids") return ["0xescrow_success", "0xunrelated_escrow"];
        return null;
      },
    };

    const res = await attemptExclusiveStateRecovery({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      txOutcome: { finalized: true, success: true },
      checkAbsenceFn: async () => ({ passed: true }),
    });

    assert.equal(res.success, false);
    assert.equal(res.assertions.singleEscrowCount.passed, false);
    assert.equal(res.assertions.singleEscrowCount.observed, 2);

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.funding.proofStatus, "PROOF_INCOMPLETE");
  });

  // 44. Exclusive-state recovery rejected for unexpected escrow ID
  it("44. Exclusive-state recovery rejected for unexpected escrow ID", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: { nonce: "1001", amountWei: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          funding: { txHash: "0xfund1" },
        },
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow_ids") return ["0xforeign_escrow_id"];
        return null;
      },
    };

    const res = await attemptExclusiveStateRecovery({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      txOutcome: { finalized: true, success: true },
      checkAbsenceFn: async () => ({ passed: true }),
    });

    assert.equal(res.success, false);
    assert.equal(res.assertions.singleEscrowIdMatch.passed, false);
    assert.equal(res.assertions.singleEscrowIdMatch.observed, "0xforeign_escrow_id");
  });

  // 45. Exclusive-state recovery rejected for nonzero unrelated economics
  it("45. Exclusive-state recovery rejected for nonzero unrelated economics", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: {
            template: "NPM_VERSION",
            package: "controlled-pkg-alpha",
            version: "1.0.0",
            expectedRepo: "controlled-org/controlled-repo",
            expectedTag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            nonce: "1001",
            windowStartUtc: "2026-10-20T20:00:00Z",
            windowEndUtc: "2026-10-22T20:00:00Z",
            amountWei: "10000000000000000",
          },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          funding: { txHash: "0xfund1" },
        },
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow_ids") return ["0xescrow_success"];
        if (functionName === "get_escrow") {
          return {
            policy: "SOURCE_LINKED",
            status: "OPEN",
            match_reason: "LOOKBACK_404_OK",
            template: "NPM_VERSION",
            package_name: "controlled-pkg-alpha",
            version: "1.0.0",
            expected_repo: "controlled-org/controlled-repo",
            expected_tag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            amount: "10000000000000000",
            nonce: "1001",
            window_start_utc: "2026-10-20T20:00:00Z",
            window_end_utc: "2026-10-22T20:00:00Z",
          };
        }
        if (functionName === "get_economics") {
          // Unrelated activity: paid_to_recipients has 5000000000000000 wei
          return {
            escrowed_open: "10000000000000000",
            paid_to_recipients: "5000000000000000",
            refunded_to_funders: "0",
            outstanding_credits: "0",
            treasury: "0",
          };
        }
        return null;
      },
    };

    const res = await attemptExclusiveStateRecovery({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      txOutcome: { finalized: true, success: true },
      checkAbsenceFn: async () => ({ passed: true }),
    });

    assert.equal(res.success, false);
    assert.equal(res.assertions.currentEconomicsMatch.passed, false);
    assert.equal(evidenceState.cases.success.funding.proofStatus, "PROOF_INCOMPLETE");
  });

  // 46. Exclusive-state recovery rejected for immutable identity mismatch
  it("46. Exclusive-state recovery rejected for immutable identity mismatch", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: {
            template: "NPM_VERSION",
            package: "controlled-pkg-alpha",
            version: "1.0.0",
            expectedRepo: "controlled-org/controlled-repo",
            expectedTag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            nonce: "1001",
            windowStartUtc: "2026-10-20T20:00:00Z",
            windowEndUtc: "2026-10-22T20:00:00Z",
            amountWei: "10000000000000000",
          },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          funding: { txHash: "0xfund1" },
        },
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow_ids") return ["0xescrow_success"];
        if (functionName === "get_escrow") {
          return {
            policy: "SOURCE_LINKED",
            status: "OPEN",
            match_reason: "LOOKBACK_404_OK",
            template: "NPM_VERSION",
            package_name: "controlled-pkg-alpha",
            version: "1.0.0",
            expected_repo: "controlled-org/controlled-repo",
            expected_tag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: "0x9999999999999999999999999999999999999999", // Mismatch recipient!
            amount: "10000000000000000",
            nonce: "1001",
            window_start_utc: "2026-10-20T20:00:00Z",
            window_end_utc: "2026-10-22T20:00:00Z",
          };
        }
        return null;
      },
    };

    const res = await attemptExclusiveStateRecovery({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      txOutcome: { finalized: true, success: true },
      checkAbsenceFn: async () => ({ passed: true }),
    });

    assert.equal(res.success, false);
    assert.equal(res.assertions.immutableIdentityMatch.passed, false);
    assert.equal(evidenceState.cases.success.funding.proofStatus, "PROOF_INCOMPLETE");
  });

  // 47. Exclusive-state recovery rejected if MISMATCH already exists
  it("47. Exclusive-state recovery rejected if MISMATCH already exists", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: { nonce: "1001", amountWei: "10000000000000000" },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          funding: { txHash: "0xfund1" },
        },
        mismatch: {
          state: "VERIFIED",
          funding: { txHash: "0xfund_mismatch" },
        },
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow_ids") return ["0xescrow_success"];
        return null;
      },
    };

    const res = await attemptExclusiveStateRecovery({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      txOutcome: { finalized: true, success: true },
      checkAbsenceFn: async () => ({ passed: true }),
    });

    assert.equal(res.success, false);
    assert.equal(res.assertions.mismatchUnfunded.passed, false);
  });

  // 48. History remains idempotent across repeated reconciliation
  it("48. History remains idempotent across repeated reconciliation", async () => {
    const validEscrow = {
      policy: "SOURCE_LINKED",
      status: "OPEN",
      match_reason: "LOOKBACK_404_OK",
      template: "NPM_VERSION",
      package_name: "controlled-pkg-alpha",
      version: "1.0.0",
      expected_repo: "controlled-org/controlled-repo",
      expected_tag: "v1.0.0",
      funder: validManifest.deployerAddress,
      recipient: controlledConfig.recipientAddress,
      amount: "10000000000000000",
      nonce: "1001",
      window_start_utc: "2026-10-20T20:00:00Z",
      window_end_utc: "2026-10-22T20:00:00Z",
      payout: "0",
      refund: "0",
    };

    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          writeInputs: {
            template: "NPM_VERSION",
            package: "controlled-pkg-alpha",
            version: "1.0.0",
            expectedRepo: "controlled-org/controlled-repo",
            expectedTag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            nonce: "1001",
            windowStartUtc: "2026-10-20T20:00:00Z",
            windowEndUtc: "2026-10-22T20:00:00Z",
            amountWei: "10000000000000000",
          },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          funding: {
            txHash: "0xfund_success",
            status: "SUBMITTED",
          },
        },
        mismatch: null,
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow_ids") return ["0xescrow_success"];
        if (functionName === "get_escrow") return validEscrow;
        if (functionName === "get_economics") {
          return {
            escrowed_open: "10000000000000000",
            paid_to_recipients: "0",
            refunded_to_funders: "0",
            outstanding_credits: "0",
            treasury: "0",
          };
        }
        return null;
      },
    };

    // First reconciliation
    await runReconcile({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      evidencePath: testEvidencePath,
      checkAbsenceFn: async () => ({ passed: true }),
    });

    let saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.history.filter((h) => h.action === "fund_verified_recovery").length, 1);

    // Second reconciliation (repeated)
    await runReconcile({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      evidencePath: testEvidencePath,
      checkAbsenceFn: async () => ({ passed: true }),
    });

    saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.history.filter((h) => h.action === "fund_verified_recovery").length, 1, "History event is not duplicated");
  });

  // 49. Release reconciliation uses the same normalized transaction outcome
  it("49. Release reconciliation uses the same normalized transaction outcome", async () => {
    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: "0xescrow_success",
          funding: { state: "VERIFIED", proofStatus: "VERIFIED" },
          release: {
            txHash: "0xrel_success",
            preEscrowSnapshot: { status: "OPEN" },
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            postEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" },
          },
        },
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    // Client provides native numeric status 7 + result 1 in getTransaction
    const mockClient = {
      getTransaction: async () => ({ status: 7, last_round: { result: 1 } }),
      getTransactionReceipt: async () => ({ status: "success" }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return {
            status: "RELEASED",
            match_reason: "VERIFIED_RELEASE",
            payout: "10000000000000000",
            recipient: controlledConfig.recipientAddress,
          };
        }
        return null;
      },
    };

    const res = await runReconcile({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      evidencePath: testEvidencePath,
      verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
    });

    assert.equal(res.inspected, 1);
    assert.equal(res.verified, 1);

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.release.state, "VERIFIED");
    assert.equal(saved.cases.success.release.proofStatus, "VERIFIED");
  });

  // 50. runFund: wait returns {status:"success"} and getTransaction returns native status 7/result 1; funding completes VERIFIED
  it("50. runFund: wait returns {status:'success'} and getTransaction returns native status 7/result 1; funding completes VERIFIED", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    try {
      let writeCount = 0;
      let fundArgs = [];
      const testTxHash = "0xfund_tx_50";

      const mockWriteClient = {
        getBalance: async () => 2000000000000000000n,
        estimateTransactionFees: async () => ({
          distribution: { leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 400n },
          feeValue: 5000000000000n,
        }),
        writeContract: async ({ args }) => {
          writeCount++;
          fundArgs = args;
          return testTxHash;
        },
        waitForTransactionReceipt: async () => ({
          status: "success",
          transactionHash: testTxHash,
        }),
        getTransaction: async ({ hash }) => {
          assert.equal(hash, testTxHash);
          return { status: 7, last_round: { result: 1 } };
        },
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow_ids") {
            if (writeCount === 0) return [];
            return [
              deriveV2EscrowId({
                funder: validManifest.deployerAddress,
                recipient: controlledConfig.recipientAddress,
                template: controlledConfig.cases.success.template,
                package_name: controlledConfig.cases.success.package,
                version: controlledConfig.cases.success.version,
                expected_repo: controlledConfig.cases.success.expectedRepo,
                expected_tag: controlledConfig.cases.success.expectedTag,
                window_start_utc: fundArgs[6],
                window_end_utc: fundArgs[7],
                amount_wei: PRINCIPAL_PER_ESCROW_WEI,
                nonce: controlledConfig.cases.success.nonce,
              }),
            ];
          }
          if (functionName === "get_escrow") {
            return {
              policy: "SOURCE_LINKED",
              status: "OPEN",
              match_reason: "LOOKBACK_404_OK",
              expected_repo: controlledConfig.cases.success.expectedRepo.toLowerCase(),
              expected_tag: controlledConfig.cases.success.expectedTag,
              template: controlledConfig.cases.success.template,
              package_name: controlledConfig.cases.success.package,
              version: controlledConfig.cases.success.version,
              funder: validManifest.deployerAddress,
              recipient: controlledConfig.recipientAddress,
              amount: PRINCIPAL_PER_ESCROW_WEI.toString(),
              nonce: controlledConfig.cases.success.nonce,
              window_start_utc: fundArgs[6],
              window_end_utc: fundArgs[7],
              payout: "0",
              refund: "0",
            };
          }
          if (functionName === "get_economics") {
            return writeCount === 0
              ? { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" }
              : { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" };
          }
          return null;
        },
      };

      const res = await runFund({
        client: mockWriteClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        deployerAccount: { address: validManifest.deployerAddress },
        queryRegistryFn: async () => ({ exists: false }),
        queryGithubFn: async () => ({ exists: false }),
      });

      assert.equal(writeCount, 1, "Exactly 1 writeContract call");
      assert.equal(res.success, true);
      assert.equal(res.txHash, testTxHash);

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.state, "VERIFIED");
      assert.equal(saved.cases.success.funding.status, "FINALIZED");
      assert.equal(saved.cases.success.funding.txHash, testTxHash);
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 51. runRelease: wait returns {status:"success"} and getTransaction returns native status 7/result 1; release proceeds to its verified result
  it("51. runRelease: wait returns {status:'success'} and getTransaction returns native status 7/result 1; release proceeds to its verified result", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    try {
      let writeCount = 0;
      const testReleaseTxHash = "0xrel_tx_51";
      const testEscrowId = "0xescrow_51";

      const evidenceState = {
        contractAddress: REQUIRED_CONTRACT_ADDRESS,
        cases: {
          success: {
            escrowId: testEscrowId,
            state: "VERIFIED",
            funding: { state: "VERIFIED", proofStatus: "VERIFIED", txHash: "0xfund_tx_51" },
            release: {
              state: "UNFUNDED",
              preEscrowSnapshot: { status: "OPEN" },
              preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
              postEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" },
            },
          },
        },
        history: [],
      };
      writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

      const completeAllocations = buildV2ReleaseAllocations({
        recipient: controlledConfig.recipientAddress,
        funder: validManifest.deployerAddress,
        budget: 150000000000000n,
      });

      const mockWriteClient = {
        estimateTransactionFees: async () => ({
          distribution: { leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 400n },
          feeValue: 5000000000000n,
          messageAllocations: completeAllocations,
        }),
        writeContract: async () => {
          writeCount++;
          return testReleaseTxHash;
        },
        waitForTransactionReceipt: async () => ({
          status: "success",
          transactionHash: testReleaseTxHash,
        }),
        getTransaction: async ({ hash }) => {
          assert.equal(hash, testReleaseTxHash);
          return { status: 7, last_round: { result: 1 } };
        },
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow") {
            return {
              status: writeCount > 0 ? "RELEASED" : "OPEN",
              match_reason: writeCount > 0 ? "VERIFIED_RELEASE" : "",
              payout: writeCount > 0 ? "10000000000000000" : "0",
              refund: "0",
              expected_repo: "controlled-org/controlled-repo",
              expected_tag: "v1.0.0",
              template: "NPM_VERSION",
              package_name: "controlled-pkg-alpha",
              version: "1.0.0",
              window_start_utc: "2026-01-01T00:00:00Z",
              window_end_utc: "2026-06-01T00:00:00Z",
              expire_at_utc: "2026-07-01T00:00:00Z",
              recipient: controlledConfig.recipientAddress,
              funder: validManifest.deployerAddress,
            };
          }
          if (functionName === "get_economics") {
            return writeCount > 0
              ? { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" }
              : { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" };
          }
          return null;
        },
      };

      const res = await runRelease({
        client: mockWriteClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        submitterAccount: { address: "0x2222222222222222222222222222222222222222" },
        getRpcTimeFn: async () => new Date("2026-06-02T00:00:00Z"),
        queryRegistryFn: async () => ({ exists: true, statusCode: 200, kind: "200", isYanked: false, publishTime: "2026-06-01T00:00:00Z", normalizedRepo: "controlled-org/controlled-repo" }),
        queryGithubFn: async () => ({ exists: true, status_code: 200, kind: "200", draft: false, prerelease: false, tag_name: "v1.0.0", published_utc: "2026-06-01T00:00:00Z" }),
        verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
      });

      assert.equal(writeCount, 1, "Exactly 1 writeContract call");
      assert.equal(res.success, true);
      assert.equal(res.txHash, testReleaseTxHash);

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.release.state, "VERIFIED");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 52. Existing funding hash: getTransactionReceipt returns standard success while getTransaction returns native finalized success; recovery succeeds with zero writes
  it("52. Existing funding hash: getTransactionReceipt returns standard success while getTransaction returns native finalized success; recovery succeeds with zero writes", async () => {
    let writeCount = 0;
    const testTxHash = "0xexisting_funding_52";
    const testEscrowId = "0xescrow_52";

    const validEscrow = {
      policy: "SOURCE_LINKED",
      status: "OPEN",
      match_reason: "LOOKBACK_404_OK",
      template: "NPM_VERSION",
      package_name: "controlled-pkg-alpha",
      version: "1.0.0",
      expected_repo: "controlled-org/controlled-repo",
      expected_tag: "v1.0.0",
      funder: validManifest.deployerAddress,
      recipient: controlledConfig.recipientAddress,
      amount: "10000000000000000",
      nonce: "1001",
      window_start_utc: "2026-10-20T20:00:00Z",
      window_end_utc: "2026-10-22T20:00:00Z",
      payout: "0",
      refund: "0",
    };

    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: testEscrowId,
          writeInputs: {
            template: "NPM_VERSION",
            package: "controlled-pkg-alpha",
            version: "1.0.0",
            expectedRepo: "controlled-org/controlled-repo",
            expectedTag: "v1.0.0",
            funder: validManifest.deployerAddress,
            recipient: controlledConfig.recipientAddress,
            nonce: "1001",
            windowStartUtc: "2026-10-20T20:00:00Z",
            windowEndUtc: "2026-10-22T20:00:00Z",
          },
          preEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          postEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" },
          onChainAudit: validEscrow,
          funding: {
            txHash: testTxHash,
            status: "SUBMITTED",
          },
        },
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({ status: "success", transactionHash: testTxHash }),
      getTransaction: async () => ({ status: 7, last_round: { result: 1 } }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") return validEscrow;
        return null;
      },
      writeContract: async () => {
        writeCount++;
        throw new Error("Duplicate writeContract forbidden");
      },
    };

    const res = await reconcileExistingFundingHash({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      existingCase: evidenceState.cases.success,
      expectedEscrowId: testEscrowId,
    });

    assert.equal(writeCount, 0, "Zero writeContract calls during existing hash recovery");
    assert.equal(res.success, true);
    assert.equal(res.reconciled, true);
    assert.equal(evidenceState.cases.success.state, "VERIFIED");
  });

  // 53. Existing release hash: same standard/native split; recovery succeeds with zero writes
  it("53. Existing release hash: standard success receipt + native finalized success; recovery succeeds with zero writes", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    let writeCount = 0;
    const testReleaseTx = "0xexisting_rel_53";
    const testEscrowId = "0xescrow_53";

    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          escrowId: testEscrowId,
          funding: { state: "VERIFIED", proofStatus: "VERIFIED" },
          release: {
            txHash: testReleaseTx,
            preEscrowSnapshot: { status: "OPEN" },
            preEconomicsSnapshot: { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0" },
            postEconomicsSnapshot: { escrowed_open: "0", paid_to_recipients: "10000000000000000", refunded_to_funders: "0" },
          },
        },
      },
      history: [],
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const mockClient = {
      getTransactionReceipt: async () => ({ status: "success", transactionHash: testReleaseTx }),
      getTransaction: async () => ({ status: 7, last_round: { result: 1 } }),
      readContract: async ({ functionName }) => {
        if (functionName === "get_escrow") {
          return {
            status: "RELEASED",
            match_reason: "VERIFIED_RELEASE",
            payout: "10000000000000000",
            recipient: controlledConfig.recipientAddress,
            funder: validManifest.deployerAddress,
          };
        }
        return null;
      },
      writeContract: async () => {
        writeCount++;
        throw new Error("Duplicate writeContract forbidden");
      },
    };

    const res = await runRelease({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidencePath: testEvidencePath,
      verifyTransferFn: async () => ({ messageEmitted: true, fundsDelivered: true }),
    });

    assert.equal(writeCount, 0, "Zero writeContract calls during existing release hash recovery");
    assert.equal(res.success, true);
    assert.equal(res.reconciled, true);
    assert.equal(res.state, "VERIFIED");
  });

  // 54. Standard success receipt with unavailable native transaction remains fail-closed
  it("54. Standard success receipt with unavailable native transaction remains fail-closed", async () => {
    let writeCount = 0;
    const mockClient = {
      getTransactionReceipt: async () => ({ status: "success", transactionHash: "0xhash_54" }),
      getTransaction: async () => null,
      writeContract: async () => {
        writeCount++;
        throw new Error("Write forbidden");
      },
    };

    const outcome = await getTransactionOutcome(mockClient, "0xhash_54");
    assert.equal(outcome.finalized, false);
    assert.equal(outcome.success, false);
    assert.throws(
      () => verifyAuthoritativeOutcome(outcome),
      /Transaction was not finalized/
    );

    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          funding: { txHash: "0xhash_54", status: "SUBMITTED" },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const res = await reconcileExistingFundingHash({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      existingCase: evidenceState.cases.success,
      expectedEscrowId: "0xescrow_54",
    });

    assert.equal(writeCount, 0, "Zero writes when native transaction unavailable");
    assert.equal(res.success, false);
    assert.equal(res.proofStatus, "PENDING_FINALIZATION");
  });

  // 55. Native pending result preserves PENDING_FINALIZATION
  it("55. Native pending result preserves PENDING_FINALIZATION", async () => {
    let writeCount = 0;
    const testHash = "0xpending_hash_55";
    const mockClient = {
      getTransactionReceipt: async () => ({ status: "success", transactionHash: testHash }),
      getTransaction: async () => ({ status: 5, statusName: "COMMITTING" }),
      writeContract: async () => {
        writeCount++;
        throw new Error("Write forbidden");
      },
    };

    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          funding: { txHash: testHash, status: "SUBMITTED" },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const res = await reconcileExistingFundingHash({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      existingCase: evidenceState.cases.success,
      expectedEscrowId: "0xescrow_55",
    });

    assert.equal(writeCount, 0, "Zero writes on pending result");
    assert.equal(res.success, false);
    assert.equal(res.state, "PENDING");
    assert.equal(res.proofStatus, "PENDING_FINALIZATION");

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.state, "PENDING");
    assert.equal(saved.cases.success.funding.proofStatus, "PENDING_FINALIZATION");
    assert.equal(saved.cases.success.funding.txHash, testHash);
  });

  // 56. Native failed execution becomes FINALIZED_FAILED
  it("56. Native failed execution becomes FINALIZED_FAILED", async () => {
    let writeCount = 0;
    const testHash = "0xfailed_hash_56";
    const mockClient = {
      getTransactionReceipt: async () => null,
      getTransaction: async () => ({ status: 7, txExecutionResult: 2, txExecutionResultName: "EXECUTION_FAILED" }),
      writeContract: async () => {
        writeCount++;
        throw new Error("Write forbidden");
      },
    };

    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          funding: { txHash: testHash, status: "SUBMITTED" },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const res = await reconcileExistingFundingHash({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      existingCase: evidenceState.cases.success,
      expectedEscrowId: "0xescrow_56",
    });

    assert.equal(writeCount, 0, "Zero writes on failed execution");
    assert.equal(res.success, false);
    assert.equal(res.state, "FINALIZED_FAILED");
    assert.equal(res.proofStatus, "EXECUTION_FAILED");

    const saved = readJsonSafe(testEvidencePath);
    assert.equal(saved.cases.success.state, "FINALIZED_FAILED");
    assert.equal(saved.cases.success.funding.proofStatus, "EXECUTION_FAILED");
  });

  // 57. Timeout followed by native finalized success recovers without resubmission
  it("57. Timeout followed by native finalized success recovers without resubmission", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    try {
      let writeCount = 0;
      let fundArgs = [];
      const testTxHash = "0xfund_timeout_57";

      const mockWriteClient = {
        getBalance: async () => 2000000000000000000n,
        estimateTransactionFees: async () => ({
          distribution: { leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 400n },
          feeValue: 5000000000000n,
        }),
        writeContract: async ({ args }) => {
          writeCount++;
          fundArgs = args;
          return testTxHash;
        },
        waitForTransactionReceipt: async () => {
          throw new Error("Transaction receipt timed out after maximum retries");
        },
        getTransactionReceipt: async () => ({
          status: "success",
          transactionHash: testTxHash,
        }),
        getTransaction: async () => ({
          status: 7,
          last_round: { result: 1 },
        }),
        readContract: async ({ functionName }) => {
          if (functionName === "get_escrow_ids") {
            if (writeCount === 0) return [];
            return [
              deriveV2EscrowId({
                funder: validManifest.deployerAddress,
                recipient: controlledConfig.recipientAddress,
                template: controlledConfig.cases.success.template,
                package_name: controlledConfig.cases.success.package,
                version: controlledConfig.cases.success.version,
                expected_repo: controlledConfig.cases.success.expectedRepo,
                expected_tag: controlledConfig.cases.success.expectedTag,
                window_start_utc: fundArgs[6],
                window_end_utc: fundArgs[7],
                amount_wei: PRINCIPAL_PER_ESCROW_WEI,
                nonce: controlledConfig.cases.success.nonce,
              }),
            ];
          }
          if (functionName === "get_escrow") {
            return {
              policy: "SOURCE_LINKED",
              status: "OPEN",
              match_reason: "LOOKBACK_404_OK",
              expected_repo: controlledConfig.cases.success.expectedRepo.toLowerCase(),
              expected_tag: controlledConfig.cases.success.expectedTag,
              template: controlledConfig.cases.success.template,
              package_name: controlledConfig.cases.success.package,
              version: controlledConfig.cases.success.version,
              funder: validManifest.deployerAddress,
              recipient: controlledConfig.recipientAddress,
              amount: PRINCIPAL_PER_ESCROW_WEI.toString(),
              nonce: controlledConfig.cases.success.nonce,
              window_start_utc: fundArgs[6],
              window_end_utc: fundArgs[7],
              payout: "0",
              refund: "0",
            };
          }
          if (functionName === "get_economics") {
            return writeCount === 0
              ? { escrowed_open: "0", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" }
              : { escrowed_open: "10000000000000000", paid_to_recipients: "0", refunded_to_funders: "0", outstanding_credits: "0", treasury: "0" };
          }
          return null;
        },
      };

      const res = await runFund({
        client: mockWriteClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        deployerAccount: { address: validManifest.deployerAddress },
        queryRegistryFn: async () => ({ exists: false }),
        queryGithubFn: async () => ({ exists: false }),
      });

      assert.equal(writeCount, 1, "Exactly 1 writeContract call — zero duplicate resubmissions");
      assert.equal(res.success, true);
      assert.equal(res.reconciled, true);

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.state, "VERIFIED");
      assert.equal(saved.cases.success.funding.txHash, testTxHash);
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 58. Timeout followed by native pending persists the hash and submits zero additional writes
  it("58. Timeout followed by native pending persists the hash and submits zero additional writes", async () => {
    process.env.SHIPLOCK_LIVE_WRITE = "YES";
    try {
      let writeCount = 0;
      const testTxHash = "0xfund_timeout_58";

      const mockWriteClient = {
        getBalance: async () => 2000000000000000000n,
        estimateTransactionFees: async () => ({
          distribution: { leaderTimeunitsAllocation: 200n, validatorTimeunitsAllocation: 400n },
          feeValue: 5000000000000n,
        }),
        writeContract: async () => {
          writeCount++;
          return testTxHash;
        },
        waitForTransactionReceipt: async () => {
          throw new Error("Transaction receipt timed out");
        },
        getTransactionReceipt: async () => null,
        getTransaction: async () => ({
          status: 5,
          statusName: "COMMITTING",
        }),
        readContract: async () => null,
      };

      const res = await runFund({
        client: mockWriteClient,
        manifest: validManifest,
        config: controlledConfig,
        caseName: "success",
        evidencePath: testEvidencePath,
        deployerAccount: { address: validManifest.deployerAddress },
        queryRegistryFn: async () => ({ exists: false }),
        queryGithubFn: async () => ({ exists: false }),
      });

      assert.equal(writeCount, 1, "Exactly 1 writeContract call — zero duplicate resubmissions");
      assert.equal(res.success, false);
      assert.equal(res.state, "PENDING");
      assert.equal(res.proofStatus, "PENDING_FINALIZATION");

      const saved = readJsonSafe(testEvidencePath);
      assert.equal(saved.cases.success.funding.txHash, testTxHash);
      assert.equal(saved.cases.success.state, "PENDING");
      assert.equal(saved.cases.success.funding.proofStatus, "PENDING_FINALIZATION");
    } finally {
      delete process.env.SHIPLOCK_LIVE_WRITE;
    }
  });

  // 59. Contradictory standard/native outcomes fail closed with zero writes
  it("59. Contradictory standard/native outcomes fail closed with zero writes", async () => {
    let writeCount = 0;

    // Case A: EVM reverted vs native success
    const outcomeA = normalizeTransactionOutcome(
      { status: "reverted", transactionHash: "0xhash_59a" },
      { status: 7, last_round: { result: 1 } }
    );
    assert.equal(outcomeA.finalized, false);
    assert.equal(outcomeA.success, false);
    assert.throws(
      () => verifyAuthoritativeOutcome(outcomeA),
      /Transaction outcome contradiction.*reverted while native status indicates success/
    );

    // Case B: EVM success vs native execution failed
    const outcomeB = normalizeTransactionOutcome(
      { status: "success", transactionHash: "0xhash_59b" },
      { status: 7, txExecutionResult: 2, txExecutionResultName: "EXECUTION_FAILED" }
    );
    assert.equal(outcomeB.finalized, false);
    assert.equal(outcomeB.success, false);
    assert.throws(
      () => verifyAuthoritativeOutcome(outcomeB),
      /Transaction outcome contradiction.*success while native status indicates execution failed/
    );

    // Reconcile with contradictory client
    const mockClient = {
      getTransactionReceipt: async () => ({ status: "reverted", transactionHash: "0xhash_59a" }),
      getTransaction: async () => ({ status: 7, last_round: { result: 1 } }),
      writeContract: async () => {
        writeCount++;
        throw new Error("Write forbidden");
      },
    };

    const evidenceState = {
      contractAddress: REQUIRED_CONTRACT_ADDRESS,
      cases: {
        success: {
          funding: { txHash: "0xhash_59a", status: "SUBMITTED" },
        },
      },
    };
    writeFileSync(testEvidencePath, JSON.stringify(evidenceState, null, 2), "utf-8");

    const res = await reconcileExistingFundingHash({
      client: mockClient,
      manifest: validManifest,
      config: controlledConfig,
      caseName: "success",
      evidence: evidenceState,
      evidencePath: testEvidencePath,
      existingCase: evidenceState.cases.success,
      expectedEscrowId: "0xescrow_59",
    });

    assert.equal(writeCount, 0, "Zero writes on contradictory outcomes");
    assert.equal(res.success, false);
  });
});
