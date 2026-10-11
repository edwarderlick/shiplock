# ShipLock Steward Evidence & Repository Audit Report

**Network**: GenLayer Studio Next (`studio-dev`) | **Chain ID**: `61997` (`0xF22D`)  
**Active Contract Address**: `0x7Cef756668Cd925807e8B110D0330643c6F809E3`  
**Canonical RPC**: `https://studio-dev.genlayer.com/api`  
**Production Web URL**: https://shiplock-chi.vercel.app/  
**Contract Explorer**: https://explorer-studio-dev.genlayer.com/address/0x7Cef756668Cd925807e8B110D0330643c6F809E3  
**Audit & Verification Date**: October 11, 2026  

---

## 1. Verified Active Configuration & On-Chain State

ShipLock is an immutable, time-gated package publication escrow deployed to GenLayer Studio Next. Release decisions are resolved using GenLayer decentralized validator consensus querying public registry HTTP endpoints (`pypi.org` and `registry.npmjs.org`).

### Active Deployment Parity
| Parameter | Value | Verification Status |
|---|---|---|
| **Contract Address** | `0x7Cef756668Cd925807e8B110D0330643c6F809E3` | Confirmed active on Studio Next |
| **Deployment Transaction** | [`0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854`](https://explorer-studio-dev.genlayer.com/tx/0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854) | Status: `FINALIZED`, Execution: `FINISHED_WITH_RETURN` |
| **Deployer Wallet** | `0x20E850BAaD26d763d4f691780D1BEBA01c8D6084` | Live Studio Next account |
| **Recipient Wallet** | `0x0f907a2598AEF71B988f9208103066586A1a4aF0` | Configured test recipient |
| **Source SHA-256 Hash** | `be743c1a8277716d21018911352fe9d7ccd3dd30fb1b8d829d19384133401a0e` | 100% on-chain byte parity with `contracts/shiplock.py` |

### Live On-Chain Economics (`get_economics()`)
Snapshot read directly from contract `0x7Cef756668Cd925807e8B110D0330643c6F809E3`:
- **`escrowed_open`**: `0.06 GEN` (`60000000000000000 wei`)
  - PyPI 404 Smoke Escrow: `0.02 GEN`
  - npm 404 Smoke Escrow: `0.02 GEN`
  - PyPI Release Candidate Escrow: `0.01 GEN`
  - npm Release Candidate Escrow: `0.01 GEN`
- **`refunded_to_funders`**: `0.01 GEN` (`10000000000000000 wei` from canceled escrow `0xd450d74c...`)
- **`paid_to_recipients`**: `0.00 GEN`
- **`outstanding_credits`**: `0.00 GEN`
- **`treasury`**: `0.00 GEN`

---

## 2. Completed On-Chain Evidence Audit

The following transactions and escrows have been audited against scripts and verified directly via live RPC query:

| Escrow Role | Package & Version | On-Chain Escrow ID | Fund / Cancel Transaction | Final State & Economics |
|---|---|---|---|---|
| **Contract Deploy** | N/A | N/A | [`0x3f7e8333...`](https://explorer-studio-dev.genlayer.com/tx/0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854) | Deployed contract `0x7Cef...09E3` |
| **PyPI 404 Smoke** | `shiplock-smoke-does-not-exist` @ `0.0.0-smoke.1` | `0x1ac2eea7c83967a0abe667355598d3809fb2552cc5d4227ad7ba86fee09a3c46` | Fund: [`0x6a307ceab940...`](https://explorer-studio-dev.genlayer.com/tx/0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312) | `OPEN` (0.02 GEN locked, `LOOKBACK_404_OK`) |
| **npm 404 Smoke** | `shiplock-smoke-does-not-exist-npm` @ `0.0.0-smoke.1` | `0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e` | Fund: [`0xd25c4478f9be...`](https://explorer-studio-dev.genlayer.com/tx/0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617) | `OPEN` (0.02 GEN locked, `LOOKBACK_404_OK`) |
| **Canceled Smoke** | `shiplock-smoke-cancel-target` @ `0.0.0-smoke.1` | `0xd450d74c9eee0d8ff4d92983bfc79ee55f01ef3609c4e6d0dd5fcb0c8867c2a3` | Fund: [`0x2ce8683d...`](https://explorer-studio-dev.genlayer.com/tx/0x2ce8683d5762d9b322b1a91ef0f1bc4f70cdbfabb4267a42a6e26f47951c640e)<br>Cancel: [`0xdb6d919c...`](https://explorer-studio-dev.genlayer.com/tx/0xdb6d919c7b4462d479917e8df1783a6a087053c80e24bf5bce2600f0fc56ab4e) | `CANCELED` (0.01 GEN native refunded to funder via `emit_transfer`) |
| **PyPI Release Cand.** | `shiplock-steward-release-live` @ `1.0.0` | `0xdc2dfac88f9a7dbc2615c3a2338cd12819efca660352c1d1c8b6f530ed5f9c1a` | Fund: [`0x0f09d238...`](https://explorer-studio-dev.genlayer.com/tx/0x0f09d23831be1fb344b135c09cb674529e4caa5c607fe665988b5da80d342cc6) | `OPEN` (0.01 GEN locked, `LOOKBACK_404_OK`) |
| **npm Release Cand.** | `shiplock-steward-release-live` @ `1.0.0` | `0x3c46e617d6541f63e69f783c0a481f429bb9c7e08509274ebbef25fc1b8444ad` | Fund: [`0xb627438c...`](https://explorer-studio-dev.genlayer.com/tx/0xb627438c2bb6190960b9eea4c4acb8f09847e14aa02e0b4b219056437bd30a01) | `OPEN` (0.01 GEN locked, `LOOKBACK_404_OK`) |

*Correction Note*: The canceled escrow ID was verified on-chain as `0xd450d74c9eee0d8ff4d92983bfc79ee55f01ef3609c4e6d0dd5fcb0c8867c2a3` (correcting a prior documentation typo).

---

## 3. Fail-Closed Evidence Harness Architecture

To guarantee that rerun, timeout, or interruption never results in double-submission, state corruption, or false verification claims, both runners (`settle_404_escrows.mjs` and `release_candidate_escrows.mjs`) implement strict safety invariants via [`scripts/evidence_helper.mjs`](file:///d:/shiplock/scripts/evidence_helper.mjs):

1. **PyPI Version Endpoint Parity (`urls[]` parsing)**:
   - Matches `contracts/shiplock.py:126-200` by parsing `data.urls[]` rather than assuming a `releases` key exists (which does not exist at `https://pypi.org/pypi/{package}/{version}/json`).
   - Requires a usable upload timestamp (`upload_time_iso_8601` or `upload_time`) from an actual non-yanked file in `urls[]`.
   - Distinguishes HTTP 404, package name/version mismatches, inconclusive responses, yanked files/releases, and valid 200 publications.
2. **Fail-Closed Release Candidate Policy**:
   - `release_candidate_escrows.mjs` submits a write *only* when the exact version has trustworthy evidence of publication inside `[window_start_utc, window_end_utc]` and is not yanked.
   - For missing (HTTP 404), inconclusive (`kind !== "200"`), yanked (`isYanked === true`), or out-of-window (`pubDt < start || pubDt > end`) evidence, the runner records the finding and stops without submitting a write transaction.
3. **Pre-Transaction Baseline Snapshot Persistence**:
   - Before submitting any transaction, the runner captures `preEscrowSnapshot` (from `get_escrow`) and `preEconomicsSnapshot` (from `get_economics`).
   - Persists the baseline snapshots immediately alongside the pending `txHash` and `txStatus: "PENDING"` before awaiting receipt confirmation.
4. **Pending Transaction Reconciliation on Restart & Genuinely Pending Protection**:
   - Reconciles any genuinely pending transaction *before* applying current registry or time gates.
   - Upon restart, looks up any recorded pending hash on-chain via `getTransaction` and awaits finalization if still pending.
   - Never overwrites or resubmits while a hash is genuinely pending (`!completed`).
   - Reconciles post-state against the *exact baseline snapshots* captured when that transaction was submitted.
5. **Executed On-Chain Cross-Boundary Settlement Handling & Distinct Evidence Flags**:
   - The runner handles the `window_end` boundary using the transaction's executed on-chain outcome rather than its local submission timestamp.
   - An in-window check submitted near `window_end` that executes after `window_end` on-chain evaluates `now_dt >= end_dt` in `contracts/shiplock.py:598-623` and transitions directly to `REFUND_NOHIT` (`WINDOW_EXPIRED_NO_RELEASE`), refunding the funder.
   - **Distinct Evidence Flags**: The harness maintains separate evidence flags: `early404Verified` and `refundSettlementVerified`. A transaction executed across `window_end` that refunds the funder is recorded as verified final refund settlement (`refundSettlementVerified = true`, `postWindowSettlement.verified = true`, `finalState.settled = true`), but is explicitly **NOT** counted as an early 404 proof (`early404Verified = false`, `inWindowAttempt.verified = false`). This safely resolves settlement and prevents duplicate post-window settlement submissions.
6. **Completed Temporary Failure Retry Lifecycle**:
   - After a transaction is `FINALIZED` / `FINISHED_WITH_RETURN` and proves an in-window temporary registry failure (e.g. `EARLY_UNAVAILABLE_RETRYABLE`) with `OPEN` escrow and unchanged funds, its hash, baseline, and outcome are preserved in attempt history (`record.inWindowAttempts`).
   - The attempt is marked completed (`completed: true`), keeping the 404 proof unverified (`early404Verified: false`).
   - On the next run inside the window, the runner reconciles any genuinely pending transaction first, then allows one **new** release attempt with a fresh baseline snapshot and new hash. Both hashes and baselines remain preserved in evidence history.
7. **Strict In-Window 404 & Settlement Verification Criteria (`verified=true`)**:
   - Never marks `verified=true` unless all 4 gates pass:
     1. Finalized execution result (`FINALIZED` + `FINISHED_WITH_RETURN`).
     2. Post-state escrow matches expectations (`RELEASED` with `match_reason: "200_IN_WINDOW"` for release candidates; `REFUND_NOHIT` with `WINDOW_EXPIRED_NO_RELEASE` for post-window settlements; `OPEN` with `match_reason: "EARLY_404_RETRYABLE"` for in-window 404 proofs).
     3. Exact payout/refund amounts match principal (0 for in-window checks).
     4. On-chain economics delta matches expected type (`PAYOUT`, `REFUND`, or `NO_CHANGE`) relative to `preEconomicsSnapshot`.
   - **Temporary Registry Failure Separation**: If an in-window check produces a temporary registry failure, the harness verifies unchanged principal and economics, records the failure in attempt history, and does NOT mark the 404 proof verified.
8. **Atomic Evidence Persistence**:
   - Uses `atomicWriteJson`: writes to a unique temporary file (`.tmp.<timestamp>.<rand>`) and calls `renameSync` to eliminate file truncation risks if interrupted.

---

## 4. Time-Gated 404 Settlement Schedule & Execution

The PyPI and npm 404 smoke escrows are protected by on-chain timelocks:
- `window_start_utc`: `2026-10-12 10:33:18 UTC`
- `window_end_utc`: `2026-10-14 10:33:18 UTC`
- `expire_at_utc`: `2026-10-21 10:33:18 UTC`

Pre-window release calls are strictly rejected by the contract (`contracts/shiplock.py:548`). Neither branch has been executed early.

### Execution Plan
1. **In-Window Retryable Check**:
   - **Permitted Time**: Between `2026-10-12 10:33:18 UTC` and `2026-10-14 10:33:18 UTC`.
   - **Command**: `node scripts/settle_404_escrows.mjs`
   - **Expected Outcome**: Contract fetches registry $\rightarrow$ 404 miss $\rightarrow$ escrow remains `OPEN` with `0.02 GEN` principal intact $\rightarrow$ economics unchanged.
2. **Post-Window Final No-Hit Settle**:
   - **Permitted Time**: At or after `2026-10-14 10:33:18 UTC`.
   - **Command**: `node scripts/settle_404_escrows.mjs`
   - **Expected Outcome**: Contract fetches registry $\rightarrow$ 404 miss after window end $\rightarrow$ transitions to `REFUND_NOHIT` (`WINDOW_EXPIRED_NO_RELEASE`) $\rightarrow$ 100% of principal (`0.02 GEN` each) credited to funder $\rightarrow$ economics updates `refunded_to_funders += 0.04 GEN`.

---

## 5. Candidate Release Escrows & Registry Artifacts

### Candidate Escrows Configuration
- **PyPI Candidate**: `shiplock-steward-release-live` @ `1.0.0`
  - Escrow ID: `0xdc2dfac88f9a7dbc2615c3a2338cd12819efca660352c1d1c8b6f530ed5f9c1a`
  - Window: `2026-10-12 12:11:12 UTC` $\rightarrow$ `2026-10-14 12:11:12 UTC`
  - Expire: `2026-10-21 12:11:12 UTC`
- **npm Candidate**: `shiplock-steward-release-live` @ `1.0.0`
  - Escrow ID: `0x3c46e617d6541f63e69f783c0a481f429bb9c7e08509274ebbef25fc1b8444ad`
  - Window: `2026-10-12 12:11:12 UTC` $\rightarrow$ `2026-10-14 12:11:12 UTC`
  - Expire: `2026-10-21 12:11:12 UTC`

### Contract Timing Invariant
Under `contracts/shiplock.py` (lines 548, 570), an artifact published **inside** `[window_start_utc, window_end_utc]` can be released to the recipient at **any time** before `expire_at_utc` (`now < expire_at`), even after `window_end` has passed.

### Prepared Package Artifacts
Clean, minimal package sources have been staged in the repository:
- PyPI: [`packages/shiplock-steward-release-live/pypi/`](file:///d:/shiplock/packages/shiplock-steward-release-live/pypi/) (`pyproject.toml`, `README.md`, `__init__.py`)
- npm: [`packages/shiplock-steward-release-live/npm/`](file:///d:/shiplock/packages/shiplock-steward-release-live/npm/) (`package.json`, `README.md`, `index.js`)

Both package names were verified as available on public registries:
- PyPI: `https://pypi.org/pypi/shiplock-steward-release-live/json` $\rightarrow$ HTTP `404 Not Found`
- npm: `https://registry.npmjs.org/shiplock-steward-release-live` $\rightarrow$ HTTP `404 Not Found`

### Private Registry Authentication Method
Registry credentials must never be passed in command arguments, chat, logs, or committed to Git:
1. **PyPI Publication**:
   - Use environment variables in an interactive terminal:
     ```bash
     export TWINE_USERNAME="__token__"
     export TWINE_PASSWORD="<PYPI_API_TOKEN>"
     cd packages/shiplock-steward-release-live/pypi
     python -m build
     twine upload dist/*
     ```
   - Must be executed inside the window: `2026-10-12 12:11:12 UTC` to `2026-10-14 12:11:12 UTC`.
2. **npm Publication**:
   - Use an environment variable or authenticated local `.npmrc`:
     ```bash
     export NODE_AUTH_TOKEN="<NPM_AUTOMATION_TOKEN>"
     cd packages/shiplock-steward-release-live/npm
     npm publish --access public
     ```
   - Must be executed inside the window: `2026-10-12 12:11:12 UTC` to `2026-10-14 12:11:12 UTC`.
3. **Trigger On-Chain Release**:
   - Run `node scripts/release_candidate_escrows.mjs`. Queries the endpoints over HTTP, confirms publication timestamp, submits `release(id)` from non-funder account, verifies `RELEASED` state, and validates the `0.01 GEN` payout.

---

## 6. Secret Audit Scope & Precision

- **Scope**: Scanned the *active tracked tree on `main`* using [`scripts/audit_secrets.py`](file:///d:/shiplock/scripts/audit_secrets.py).
- **Findings**: **0 plaintext private keys, 0 passwords, 0 decrypted keystores, 0 `.env.local` files tracked**.
- **Important Qualification**: Sensitive local development files (`.deployer_keystore.json`, `web/.env.local`) are excluded via `.gitignore`. This audit certifies the clean state of the active commit tree and does not rewrite or erase historical Git commits.

---

## 7. Verification Test Matrix

| Test Suite | Scope | Result |
|---|---|---|
| `python -m pytest tests/direct -q` | Direct contract unit tests | **35 passed** |
| `python -m pytest tests/test_deployer_keystore.py -v` | Keystore & address preservation | **13 passed** |
| `node --test tests/test_evidence_harness.mjs` | PyPI urls parsing, fail-closed candidate release, baseline snapshots, recovery, strict early 404 retryable, temporary failure attempt history & retry lifecycle, distinct early-404 vs refund settlement flags, on-chain cross-boundary refund settlement | **27 passed** |
| `npm --prefix web test` | Frontend flow & contract runtime tests | **45 passed** |
| `npm --prefix web run lint` | ESLint static analysis | **0 errors** |
| `npm --prefix web run build` | Next.js production build | **Compiled successfully** |
| `https://shiplock-chi.vercel.app/` | Live Vercel production deployment | **Verified live** |
