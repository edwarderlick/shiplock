# ShipLock Phase C Operator Runbook: Safe v2 Live Evidence Harness

## Target Deployment Coordinates (Studio Next)
- **Active Contract Address**: `0xF2110c3E6B170caF10FE953564285C6f01cB1F0c`
- **Network**: Studio Next (`studio-dev`)
- **Chain ID**: `61997`
- **Canonical RPC Endpoint**: `https://studio-dev.genlayer.com/api`
- **Studio Next Explorer**: `https://explorer-studio-dev.genlayer.com`
- **Deployment Transaction**: [`0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f`](https://explorer-studio-dev.genlayer.com/tx/0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f)
- **Deployed Source SHA-256**: `860387dc9579aba8d445df9395c4ec80bc425b7b8a3d7b27eed8cc477b59276d` (51,327 bytes)
- **Deployer / Funder Address**: `0x20E850BAaD26d763d4f691780D1BEBA01c8D6084`
- **Dedicated Evidence File**: `scripts/v2_steward_evidence.json`

---

## Safety Architecture & Strict Interlocks

The v2 live evidence harness (`scripts/v2_live_evidence.mjs`) is engineered with fail-closed safeguards to ensure deterministic, safe on-chain evidence collection without risking funds or corrupting historical records:

1. **Strict Contract & Chain Binding**:
   - Dynamically loads and verifies active contract from `scripts/latest_deployment.json`.
   - Fails closed immediately unless `contractAddress === 0xF2110c3E6B170caF10FE953564285C6f01cB1F0c` and `chainId === 61997`.
   - Missing manifest fields (`deployerAddress`, `rpcUrl`, `transactionHash`) fail closed immediately; fallbacks are strictly prohibited.
   - Never falls back to historical v1 contract (`0x7Cef756668Cd925807e8B110D0330643c6F809E3`).
2. **Dedicated Evidence State File**:
   - Operates strictly on `scripts/v2_steward_evidence.json`.
   - Never modifies or references historical `scripts/steward_evidence.json`.
3. **Secret Protection & Volatile Key Handling**:
   - `preflight` and `reconcile` modes are **strictly read-only** and never access the OS keychain or decrypt private keys.
   - `fund` and `release` modes require the explicit environment variable `SHIPLOCK_LIVE_WRITE=YES`.
   - Credentials are read from OS keychain (`genlayer-cli` via `keytar`) directly into volatile memory and never logged, printed, serialized, or stored in process arguments.
4. **Authoritative Economic Guardrails & Message Allocations**:
   - Exactly **0.01 GEN** (10^16 wei) principal per escrow.
   - Cumulative Phase C principal hard-capped at **0.02 GEN** (2 * 10^16 wei).
   - Authoritative fee estimation before transaction signing.
   - Post-fee wallet balance reserve of at least **0.05 GEN** (5 * 10^16 wei) strictly enforced:
     `balance >= principal (0.01 GEN) + estimated fees + reserve (0.05 GEN)`
     Aborts before `writeContract` if this fails.
   - **Authoritative Returned Message Allocations**: For `release`, harness reads exclusively `feeEst.messageAllocations` (never falls back silently to locally supplied roots). Rejects missing, empty, malformed, or incomplete returned allocations and enforces coverage of both `recipient` (payout) and `funder` (refund) before submitting `feeEst.messageAllocations`.
5. **Caller Role Separation**:
   - Escrow funding is executed by the deployer/funder (`account:shiplock-deployer-live`).
   - Escrow release settlement requires a distinct non-funder submitter (`account:coverlock-submitter`). Funder callers are rejected closed.
6. **Consensus, Timing & Allocation Tree Integrity**:
   - 24-hour minimum funding lead enforced (default proposed lead is 26 hours).
   - Exact UTC second ISO timestamp normalization (`YYYY-MM-DDTHH:MM:SSZ`).
   - Cryptographically distinct nonces between success and mismatch cases (enforced in production configuration validation).
   - Deterministic 11-element preimage calculation matching `contracts/shiplock.py:fund_verified_escrow`.
   - **Deterministic Crash Recovery with Persisted Inputs**: If a `PREPARED`, `SUBMITTED`, or existing funding record exists, all expected inputs (`windowStartUtc`, `windowEndUtc`, `nonce`, `template`, `package`, `version`, `expectedRepo`, `expectedTag`, `recipient`, `amount`, `expectedEscrowId`) are reconstructed exclusively from persisted `writeInputs`. Windows and escrow IDs are never recalculated across clock advances. Local configuration is verified against persisted intent; any discrepancy fails closed and requires operator intervention.
   - **Concurrency-Safe Escrow Discovery**: Direct queries against the deterministic `expectedEscrowId` govern recovery; before/after ID-set comparisons are supplementary evidence and concurrent unrelated escrows are recorded without aborting.
   - **Authoritative Registry & GitHub Evidence Contracts**:
     - Registry evidence contract strictly uses camelCase fields: `statusCode`, `publishTime`, `isYanked`, `normalizedRepo`, `exists`, `kind`, `summary`, `error`. Success requires `statusCode === 200`, `kind === "200"`, `exists === true`, `isYanked === false`, valid finite UTC `publishTime`, and canonical `normalizedRepo` match. Fails closed on missing or foreign fields.
     - GitHub evidence contract strictly enforces `parsed.kind === "200"`, `parsed.error === null`, `status_code === 200`, exact tag, `draft === false`, prereleases rejected closed by default, and valid finite UTC `published_utc`.
   - **Success Settlement Timing Rules**:
     - Success release write is permitted when `window_start <= RPC time < expire_at`.
     - Registry publication and GitHub release timestamps must each be inside the publication window: `window_start <= publication time <= window_end`.
     - Valid success settlement is **not** rejected merely because current RPC time is after `window_end` (as long as it precedes `expire_at`).
   - **Active-Window Mismatch Settlement Rules**:
     - During active window (`RPC time < window_end`), mismatch remains `OPEN` and retryable.
     - Conclusive settlement for `REFUND_NOHIT` requires `window_end <= RPC time < expire_at`.
   - **Distinct Settlement vs Delivery Lifecycle States**:
     - Harness maintains three explicit proof states: `SETTLEMENT_VERIFIED_TRANSFER_PENDING`, `VERIFIED`, and `PROOF_INCOMPLETE`.
     - Emitted parent messages are strictly distinguished from delivered funds. If parent settlement finalized and emitted a message but child cross-contract delivery is pending: `messageEmitted=true`, `fundsDelivered=false`, `state=SETTLEMENT_VERIFIED_TRANSFER_PENDING`.
     - Marked `VERIFIED` only when child transfer proof is finalized and verified.
   - **Truthful Preflight Readiness**:
     - Preflight tracks readiness per-case: `caseReadiness.success`, `caseReadiness.mismatch`, `readyForLiveWrites`, and structured `blockers[]`.
     - Truth-telling: any placeholder coordinate, lookback failure (existing package/version, 403, 429, 5xx, inconclusive), missing manifest binding, or insufficient balance marks readiness `false` and lists explicit blockers. Overall readiness is true only when both cases are conclusively fundable.
   - **Snapshot-Based Historical Funding Proof & Lifecycle Separation**:
     - **Funding proof is historical and snapshot-based**: Validated against immediate post-funding snapshots (`onChainAudit` and `preEconomicsSnapshot -> postEconomicsSnapshot` delta).
     - **Current escrow reads verify immutable identity and lifecycle consistency**: Querying the live escrow verifies immutable preimage fields (`policy`, `template`, `package`, `version`, `expected_repo`, `expected_tag`, `funder`, `recipient`, `amount`, `nonce`, `window_start_utc`, `window_end_utc`) while permitting valid subsequent lifecycle states (`OPEN`, `RELEASED`, `REFUND_NOHIT`). Funding proof remains `VERIFIED` across subsequent settlements.
     - **Release proof is independently reconciled**: Release settlement is independently verified via the release transaction receipt, release economics delta, resulting status, and child cross-contract transfer delivery.
     - **Global economics independence & zero historical reconstruction**: Current aggregate economics (`get_economics()`) must **never** be substituted for a missing historical post-state, and current aggregate economics must never be persisted as an older transaction's post-state snapshot. This rule strictly applies across:
       - `runFund` recovery (`runFund` existing-hash recovery);
       - `runReconcile` funding and release recovery;
       - `runRelease` existing-hash recovery.
       When an existing finalized transaction hash lacks required historical transaction-scoped snapshots (`preEconomicsSnapshot -> postEconomicsSnapshot` captured at execution time):
       - The receipt and immutable escrow identity are verified where possible;
       - `proofStatus` is set to `"PROOF_INCOMPLETE"`;
       - The runner returns without submitting duplicate transactions;
       - `VERIFIED` is never claimed;
       - `postEconomicsSnapshot` is never mutated or synthesized.
       Existing genuine historical snapshots are preserved unchanged, and subsequent unrelated global economics changes cannot affect historical verification.

---

## Operator Workflow: Phases C1, C2, and C3

### Phase C1: Verification & Preflight (Current State)
Phase C1 establishes and verifies the harness without any live transactions or state mutations.

#### Step 1: Run Automated Verification Suite
Run the dedicated v2 harness behavioral test suite (34 tests):
```bash
node --test tests/test_v2_live_evidence.mjs
```
Expected output:
```text
# tests 34
# suites 1
# pass 34
# fail 0
```

#### Step 2: Run Read-Only Preflight
```bash
node scripts/v2_live_evidence.mjs preflight
```
The preflight command:
- Verifies contract code is present on-chain (51,327 characters).
- Confirms chain ID (`61997`) and RPC connectivity.
- Reads `get_escrow_ids` and `get_economics`.
- Checks deployer wallet balance (asserts $\ge 0.06$ GEN).
- Validates repository and release tag syntax.
- Performs read-only lookups against registry and GitHub releases.
- Evaluates coordinate suitability:
  - If placeholder coordinates are present in config: reports `readyForLiveWrites: false` and explains that live writes are blocked until real, controlled coordinates are provided in `scripts/v2_evidence_config.local.json`.
  - If controlled coordinates are configured and lookback passes: reports `readyForLiveWrites: true`.
- Confirms zero transactions submitted.

---

### Phase C2: Live Escrow Funding (Future Operator Phase)
*Note: Phase C1 strictly prohibits live transactions. The following steps are for Phase C2.*

#### Step 1: Configure Controlled Artifact Coordinates
Create local runtime configuration in `scripts/v2_evidence_config.local.json` (git-ignored) with real, operator-controlled coordinates (never placeholders):
```json
{
  "contractAddress": "0xF2110c3E6B170caF10FE953564285C6f01cB1F0c",
  "chainId": 61997,
  "rpcUrl": "https://studio-dev.genlayer.com/api",
  "keychainService": "genlayer-cli",
  "deployerAccount": "account:shiplock-deployer-live",
  "submitterAccount": "account:coverlock-submitter",
  "recipientAddress": "<your-controlled-nonzero-recipient-address>",
  "cases": {
    "success": {
      "name": "Controlled Success Case",
      "template": "NPM_VERSION",
      "package": "<your-controlled-npm-package>",
      "version": "1.0.0",
      "expectedRepo": "<your-github-org>/<your-repo>",
      "expectedTag": "v1.0.0",
      "amountWei": "10000000000000000",
      "windowLeadHours": 26,
      "windowDurationHours": 48,
      "nonce": "<cryptographic-random-nonce-1>"
    },
    "mismatch": {
      "name": "Controlled Mismatch Case",
      "template": "PYPI_VERSION",
      "package": "<your-controlled-pypi-package>",
      "version": "0.1.0",
      "expectedRepo": "<your-github-org>/<your-repo>",
      "expectedTag": "v0.1.0-wrong-tag",
      "amountWei": "10000000000000000",
      "windowLeadHours": 26,
      "windowDurationHours": 48,
      "nonce": "<cryptographic-random-nonce-2>"
    }
  }
}
```

#### Step 2: Fund Success Case Escrow
```powershell
$env:SHIPLOCK_LIVE_WRITE="YES"
node scripts/v2_live_evidence.mjs fund --case=success
```

#### Step 3: Fund Mismatch Case Escrow
```powershell
$env:SHIPLOCK_LIVE_WRITE="YES"
node scripts/v2_live_evidence.mjs fund --case=mismatch
```

#### Step 4: Reconcile Pending Transactions
If any transaction times out during finalization or process interruption occurs, run:
```bash
node scripts/v2_live_evidence.mjs reconcile
```

---

### Phase C3: Release Settlement & Verification (Future Operator Phase)

#### Step 1: Evidence Evolution Across Windows
1. **Success Case (In-Window Release)**:
   - Wait until `window_start_utc` is reached on Studio Next RPC.
   - Publish the controlled package to npm with matching version and repository metadata.
   - Execute release while `window_start_utc <= RPC time < expire_at_utc` (evidence must have been published within `[window_start_utc, window_end_utc]`). Success settlement is permitted after `window_end_utc` as long as publications were in-window and settlement occurs before `expire_at_utc`.
2. **Mismatch Case (Post-Window Conclusive Settlement)**:
   - During the active window (`RPC time < window_end_utc`), any mismatch release attempt remains `OPEN` and retryable (match reason `EARLY_REGISTRY_MISMATCH_RETRYABLE` or `EARLY_GITHUB_TAG_MISMATCH_RETRYABLE`).
   - For conclusive refund settlement, wait until `window_end_utc <= RPC time < expire_at_utc`.
   - Execute release post-window to trigger conclusive on-chain refund to funder.

#### Step 2: Execute Release Writes
```powershell
$env:SHIPLOCK_LIVE_WRITE="YES"
node scripts/v2_live_evidence.mjs release --case=success
```
and
```powershell
$env:SHIPLOCK_LIVE_WRITE="YES"
node scripts/v2_live_evidence.mjs release --case=mismatch
```

#### Step 3: Final Evidence Audit & Truthful Settlement States
Run reconcile to verify final states:
```bash
node scripts/v2_live_evidence.mjs reconcile
```
Inspect `scripts/v2_steward_evidence.json` to confirm:
- **Success Case**:
  - `status === "RELEASED"`
  - `match_reason === "VERIFIED_RELEASE"`
  - `payout === 10000000000000000` (0.01 GEN), `refund === 0`
  - Economics: `escrowed_open` decreased by 0.01 GEN, `paid_to_recipients` increased by 0.01 GEN
  - Matching GenVM emitted message verified to recipient
- **Mismatch Case**:
  - `status === "REFUND_NOHIT"`
  - `match_reason` matches one of the contract's conclusive negative reasons:
    `REGISTRY_REPO_MISMATCH`, `GITHUB_TAG_MISMATCH`, `GITHUB_REPO_MISMATCH`, `WINDOW_EXPIRED_GITHUB_NO_RELEASE`, `WINDOW_EXPIRED_NO_RELEASE`, or `YANKED`
  - `refund === 10000000000000000` (0.01 GEN), `payout === 0`
  - Economics: `escrowed_open` decreased by 0.01 GEN, `refunded_to_funders` increased by 0.01 GEN
  - Matching GenVM emitted message verified to funder

---

## Verification Gates Reference

All gates must pass cleanly:
```bash
# 1. Dedicated v2 Live Evidence Harness behavioral tests (34 passed)
node --test tests/test_v2_live_evidence.mjs

# 2. Historical Evidence Harness regression tests (60 passed)
node --test tests/test_evidence_harness.mjs

# 3. Python direct contract and deployer tests (57 passed)
python -m pytest

# 4. Web frontend tests (74 passed)
npm --prefix web test

# 5. Web ESLint (0 errors)
npm --prefix web run lint

# 6. Web TypeScript type-checking (0 errors)
npx --prefix web tsc --noEmit -p web/tsconfig.json

# 7. Production Next.js build
npm --prefix web run build

# 8. Git whitespace and format check
git diff --check
```
