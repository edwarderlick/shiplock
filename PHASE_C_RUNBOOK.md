# ShipLock Phase C Operator Runbook: Safe v2 Live Evidence Harness

## Target Deployment Coordinates (Studio Next)
- **Active Contract Address**: `0xF2110c3E6B170caF10FE953564285C6f01cB1F0c`
- **Network**: Studio Next (`studio-dev`)
- **Chain ID**: `61997`
- **Canonical RPC Endpoint**: `https://studio-dev.genlayer.com/api`
- **Studio Next Explorer**: `https://explorer-studio-dev.genlayer.com`
- **Deployment Transaction**: [`0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f`](https://explorer-studio-dev.genlayer.com/transactions/0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f)
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

## Operator Workflow: Phases C1 Through C4

### Phase C1: Verification & Preflight (Completed)
Phase C1 established and verified the harness without any live transactions or state mutations.

#### Step 1: Automated Verification Suite (59 Tests)
Run the dedicated v2 harness behavioral test suite:
```bash
node --test tests/test_v2_live_evidence.mjs
```
Expected output:
```text
# tests 59
# suites 1
# pass 59
# fail 0
```

#### Step 2: Read-Only Preflight
```bash
node scripts/v2_live_evidence.mjs preflight
```
The preflight command verifies contract bytecode, connectivity, empty/initial economics, and performs read-only lookbacks confirming target coordinates return HTTP 404.

---

### Phase C2: Live Escrow Funding (Completed & Verified on Studio Next)

Both live escrows have been funded on GenLayer Studio Next (`61997`) under contract `0xF2110c3E6B170caF10FE953564285C6f01cB1F0c` with 0.01 GEN (10^16 wei) locked principal each:

1. **SUCCESS Escrow (In-Window Source-Linked Verified Release Target)**:
   - **Escrow ID**: `0x5c751544da2e5d505dbdb118ca2fb94e53091bb28493c236889ae69fc78a909d`
   - **Funding Transaction**: [`0x86538668726638307a4897eb2fcb89ccd4d2ce642fc42abf10abab6ea8cf9726`](https://explorer-studio-dev.genlayer.com/transactions/0x86538668726638307a4897eb2fcb89ccd4d2ce642fc42abf10abab6ea8cf9726)
   - **Funding Status**: `FINALIZED` / `FINISHED_WITH_RETURN`
   - **On-Chain State**: `OPEN` (`LOOKBACK_404_OK`, 0.01 GEN locked)
   - **Template & Package**: `NPM_VERSION` / `shiplock-v2-evidence-f2110c3e` @ `1.0.0`
   - **Expected Repo & Tag**: `edwarderlick/shiplock` / `shiplock-evidence-v2-success-f2110c3e`
   - **Window**: `2026-10-21T06:58:31Z` to `2026-10-23T06:58:31Z`
   - **Nonce**: `1001`
   - **Provenance**: Captured via authoritative `EXCLUSIVE_STATE_RECOVERY` audit (`2026-10-20T07:27:35.665Z`) with all 10 exclusive state assertions verified against on-chain state.

2. **MISMATCH Escrow (Post-Window Conclusive Negative Refund Target)**:
   - **Escrow ID**: `0xdb592d59e4dbc85926eac234ba3c92677ec2f42aeb4de1f1430cf9454d7a5a88`
   - **Funding Transaction**: [`0xa0acb2c81ef7e8aaae6d0f826f0ca6101904a337a1ef797d22855ade0d68ecf0`](https://explorer-studio-dev.genlayer.com/transactions/0xa0acb2c81ef7e8aaae6d0f826f0ca6101904a337a1ef797d22855ade0d68ecf0)
   - **Funding Status**: `FINALIZED` / `FINISHED_WITH_RETURN`
   - **On-Chain State**: `OPEN` (`LOOKBACK_404_OK`, 0.01 GEN locked)
   - **Template & Package**: `NPM_VERSION` / `shiplock-v2-no-release-f2110c3e` @ `1.0.0`
   - **Expected Repo & Tag**: `edwarderlick/shiplock` / `shiplock-evidence-v2-missing-f2110c3e`
   - **Window**: `2026-10-21T11:20:26Z` to `2026-10-23T11:20:26Z`
   - **Nonce**: `1002`
   - **Provenance**: Captured immediately post-funding (`2026-10-20T09:21:13.367Z`) with on-chain economics verified transitioning from 0.01 GEN to 0.02 GEN open.

3. **Current Live Economics (`get_economics()`)**:
   - `escrowed_open`: `20000000000000000` wei (`0.02 GEN`)
   - `paid_to_recipients`: `0`
   - `refunded_to_funders`: `0`
   - `outstanding_credits`: `0`
   - `treasury`: `0`

4. **Common Publication Interval**:
   - UTC: `2026-10-21T11:20:26Z` through `2026-10-23T06:58:31Z`
   - IST: `2026-10-21 16:50:26` through `2026-10-23 12:28:31`
   - Duration: 43 hours, 38 minutes, 5 seconds.

---

### Phase C4A: Land Verified Evidence & Freeze Publication Bundle (Current Phase)

This phase freezes the bundle, audits the working tree, confirms external absence (HTTP 404), and commits the frozen release target commit:
1. **Zero External Publications**:
   - No npm publishing.
   - No Git tag creation.
   - No GitHub release creation.
   - Zero blockchain writes.
2. **Bundle Freeze & Dry-Run Verification**:
   - Package `evidence/npm/success`: `shiplock-v2-evidence-f2110c3e@1.0.0` (4 files, dry-run pack/publish clean).
   - Package `evidence/npm/mismatch`: `shiplock-v2-no-release-f2110c3e@1.0.0` (4 files, dry-run pack/publish clean).
3. **Absence Assertions**:
   - npm `shiplock-v2-evidence-f2110c3e@1.0.0` → HTTP 404
   - npm `shiplock-v2-no-release-f2110c3e@1.0.0` → HTTP 404
   - GitHub release `shiplock-evidence-v2-success-f2110c3e` → HTTP 404
   - GitHub release `shiplock-evidence-v2-missing-f2110c3e` → HTTP 404
4. **Git Commit & Push**:
   - Commit message: `feat(evidence): verify live v2 funding and prepare publication window`
   - Push to `origin/main`. Local HEAD equals `origin/main`. This pushed commit is the frozen release target for Phase C4B.

---

### Phase C4B: Publication, Release Settlement & Verification (Upcoming Phase)

*Execution strictly restricted to the authorized window: at or after `2026-10-21T11:20:26Z` (UTC) / `2026-10-21 16:50:26` (IST).*

#### Step 1: Publication Sequence (Inside Common Window)
1. Publish SUCCESS package to npm:
   ```bash
   cd evidence/npm/success
   npm publish --access public
   ```
2. Publish MISMATCH package to npm:
   ```bash
   cd evidence/npm/mismatch
   npm publish --access public
   ```
3. Create exactly ONE GitHub release and tag targeting the frozen commit SHA:
   - Tag / Release: `shiplock-evidence-v2-success-f2110c3e`
4. **CRITICAL INVARIANT**: Never create GitHub release tag `shiplock-evidence-v2-missing-f2110c3e`. It must remain absent indefinitely.

#### Step 2: Execute In-Window Release Write (Success Case)
Inside the common window:
```powershell
$env:SHIPLOCK_LIVE_WRITE="YES"
node scripts/v2_live_evidence.mjs release --case=success
```
Confirm:
- Status transitions to `RELEASED` with `match_reason: "VERIFIED_RELEASE"`.
- Payout: `10000000000000000` wei (`0.01 GEN`) to recipient.
- Economics: `escrowed_open` decrements to 0.01 GEN; `paid_to_recipients` increments to 0.01 GEN.

#### Step 3: Execute Post-Window Release Write (Mismatch Case)
After the MISMATCH window ends (`now >= 2026-10-23T11:20:26Z`):
```powershell
$env:SHIPLOCK_LIVE_WRITE="YES"
node scripts/v2_live_evidence.mjs release --case=mismatch
```
Confirm:
- Status transitions to `REFUND_NOHIT` with `match_reason: "WINDOW_EXPIRED_GITHUB_NO_RELEASE"`.
- Refund: `10000000000000000` wei (`0.01 GEN`) to funder.
- Economics: `escrowed_open` decrements to 0; `refunded_to_funders` increments to 0.01 GEN.

#### Step 4: Final Reconcile & State Verification
```bash
node scripts/v2_live_evidence.mjs reconcile
```

---

## Verification Gates Reference

All gates must pass cleanly:
```bash
# 1. Dedicated v2 Live Evidence Harness behavioral tests (59 passed)
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
