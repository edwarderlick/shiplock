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
- **`escrowed_open`**: `2.07 GEN` (`2070000000000000000 wei`)
  - PyPI 404 Smoke Escrow: `0.02 GEN` (`0x1ac2eea7...`)
  - npm 404 Smoke Escrow: `0.02 GEN` (`0x6a335be1...`)
  - PyPI Release Candidate Escrow: `0.01 GEN` (`0xdc2dfac8...`)
  - npm Release Candidate Escrow: `0.01 GEN` (`0x3c46e617...`)
  - Live Funding Proof Escrow: `0.01 GEN` (`0x632b64ce...`)
  - Manual Smoke Escrow: `2.00 GEN` (`0x7f24e638...`)
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
| **Live Funding Proof** | `shiplock-live-verify-phase` @ `1.0.0` | `0x632b64ce06e117d2dc11da291e031f82844fa29d25e841b95f4f33734b30270c` | Fund: [`0xd6f0881c...`](https://explorer-studio-dev.genlayer.com/tx/0xd6f0881c7ac0a3d6f30306e54cc46136c10d3b1a43c46e1c92ab8793e8f55190) | `OPEN` (0.01 GEN locked, `LOOKBACK_404_OK`, economics increased from 0.06 to 0.07 GEN) |
| **Manual Smoke Lock** | `shiplock-manual-smoke-20261011-samir` @ `1.0.1` | `0x7f24e638ea5ed353c377f968352fdf9d2e1c66959fa739fa69d1d32e54d58d53` | Failed Cancel: [`0x8c1d12c5...`](https://explorer-studio-dev.genlayer.com/tx/0x8c1d12c570b863fda838950cc09d1b9881a0fb9bd28b66915e4e3e722dda5e68) | `OPEN` (2.00 GEN locked, economics increased from 0.07 to 2.07 GEN; preserved for funder) |

*Correction Note*: The canceled escrow ID was verified on-chain as `0xd450d74c9eee0d8ff4d92983bfc79ee55f01ef3609c4e6d0dd5fcb0c8867c2a3` (correcting a prior documentation typo).

### Fee Configuration Fix & Live Funding Verification Record

1. **Failed Transaction Inspection & Explorer Status (`PhaseTimeoutOutOfBounds`)**:
   - **Transaction Hash**: `0xb8683c030c53bee50cabcacfb1c3d5263b7946bc061d317222c40581a335a9a3`
   - **Receipt Status**: `0x0`
   - **Revert Reason**: `PhaseTimeoutOutOfBounds(800,30,600)`
   - **Selected receipt fields returned by `eth_getTransactionReceipt`**:
     ```json
     {
       "transactionHash": "0xb8683c030c53bee50cabcacfb1c3d5263b7946bc061d317222c40581a335a9a3",
       "transactionIndex": "0x0",
       "blockHash": "0xb8683c030c53bee50cabcacfb1c3d5263b7946bc061d317222c40581a335a9a3",
       "blockNumber": "0x0",
       "from": "0x7e4e1f7dcc3da063f9110477ad348c90e8599253",
       "to": "0xb7278a61aa25c888815afc32ad3cc52ff24fe575",
       "cumulativeGasUsed": "0x0",
       "gasUsed": "0x0",
       "effectiveGasPrice": "0x0",
       "type": "0x0",
       "contractAddress": null,
       "logs": [],
       "status": "0x0",
       "revertReason": "PhaseTimeoutOutOfBounds(800,30,600)"
     }
     ```
   - **Explorer Display & RPC Receipt Availability**:
     When opening this transaction on the Studio Next block explorer ([`https://explorer-studio-dev.genlayer.com/tx/0xb8683c03...`](https://explorer-studio-dev.genlayer.com/tx/0xb8683c030c53bee50cabcacfb1c3d5263b7946bc061d317222c40581a335a9a3)), the explorer UI displays "Transaction not found." This absence from the web explorer is consistent with the transaction's `blockNumber: "0x0"` receipt. The canonical GenLayer Studio Next RPC node (`https://studio-dev.genlayer.com/api`) retains and returns the transaction receipt with status `0x0` and revertReason `PhaseTimeoutOutOfBounds(800,30,600)` via `eth_getTransactionReceipt`.
   - **State Impact**: Independently queried `list_ids()` and `get_economics()` on contract `0x7Cef756668Cd925807e8B110D0330643c6F809E3`. Confirmed **no escrow was created and zero principal was locked** by this transaction.

2. **Fee Profile Fix & Client Validation**:
   - **Commit SHA**: [`c2d061b`](https://github.com/edwarderlick/shiplock/commit/c2d061b) (verified on `origin/main`).
   - **Profiles Updated**: Both `fee-profile.json` and `web/src/fee-profile.json` corrected `fund_escrow` and `release` to `leaderTimeunitsAllocation: "200"` and `validatorTimeunitsAllocation: "400"`.
   - **Validation Enforced**: `web/src/lib/write.ts` enforces `validatePhaseAllocations` ensuring leader and validator allocations are strictly within `[30, 600]` before wallet signing and transaction submission across both Transaction Kit and fallback paths.
   - **Verified Vercel Deployment History (Vercel CLI Independent Verification)**:
     - Historical Fee Fix Deployment: `dpl_9p3KJWhp8VcXyBzeV1hytLAeTibA` (built and served the fee fix at commit `c2d061b`).
     - Current Production Deployment: `dpl_FhKBHcRTUzxcE1TD6W5CLbewKpAK` (confirmed as the active deployment mapped to [https://shiplock-chi.vercel.app/](https://shiplock-chi.vercel.app/) via `vercel inspect shiplock-chi.vercel.app`, status `● Ready`, target `production`).
     - Independently verified serving the 200/400 fee profile with bounds validation in production bundle `3qqakkib_nbz7.js`.

3. **Live Funding Proof**:
   - **Role**: **Live Funding Proof** (Explicitly labeled Live Funding Proof; NOT early 404, successful release, or refund proof).
   - **Transaction Hash**: [`0xd6f0881c7ac0a3d6f30306e54cc46136c10d3b1a43c46e1c92ab8793e8f55190`](https://explorer-studio-dev.genlayer.com/tx/0xd6f0881c7ac0a3d6f30306e54cc46136c10d3b1a43c46e1c92ab8793e8f55190)
   - **Transaction Status**: `FINALIZED`
   - **Execution Result**: `FINISHED_WITH_RETURN`
   - **Active Contract**: [`0x7Cef756668Cd925807e8B110D0330643c6F809E3`](https://explorer-studio-dev.genlayer.com/address/0x7Cef756668Cd925807e8B110D0330643c6F809E3)
   - **Escrow ID**: `0x632b64ce06e117d2dc11da291e031f82844fa29d25e841b95f4f33734b30270c`
   - **Template & Package**: `PYPI_VERSION`, `shiplock-live-verify-phase` @ `1.0.0`
   - **Nonce**: `5001`
   - **Recipient**: `0x0f907a2598AEF71B988f9208103066586A1a4aF0`
   - **Execution Window**: `2026-10-12T15:37:50Z` $\rightarrow$ `2026-10-14T15:37:50Z`
   - **On-Chain Escrow Status**: `OPEN` (`LOOKBACK_404_OK`)
   - **Principal Locked**: `0.01 GEN` (`10000000000000000 wei`)
   - **Economics Delta**: `escrowed_open` increased from `0.06 GEN` (`60000000000000000 wei`) to `0.07 GEN` (`70000000000000000 wei`). All other economics categories unchanged.

4. **Mode 1 Transfer Fee Failure Inspection, Preflight Simulation & Allocation Tree Verification**:
   - **Failed Cancel Transaction**: [`0x8c1d12c570b863fda838950cc09d1b9881a0fb9bd28b66915e4e3e722dda5e68`](https://explorer-studio-dev.genlayer.com/tx/0x8c1d12c570b863fda838950cc09d1b9881a0fb9bd28b66915e4e3e722dda5e68)
   - **Target Escrow**: `0x7f24e638ea5ed353c377f968352fdf9d2e1c66959fa739fa69d1d32e54d58d53` (`OPEN`, 2.00 GEN locked)
   - **Funder Account**: `0x7E4E1f7DcC3DA063F9110477Ad348C90E8599253`
   - **Receipt Status & Error**: Status `FINALIZED`, Execution `ERROR`, GenVM stderr:
     `Mode1MessageFeesRequireGenVMPerEmissionSupport: fee-bearing GenVM messages require a message allocation tree`
   - **Emission & Fee Trace Audit**:
     Traced every write method capable of calling `emit_transfer`:
     - `cancel(id)`: refunds funder when called before `window_start`
     - `release(id)`: pays recipient if valid in-window publication is verified
     - `release(id)`: refunds funder if absent/unreleased at or after `window_end` (`REFUND_NOHIT`)
     - `expire(id)`: refunds funder after expiration
     - `withdraw()`: transfers accumulated credit to caller
     *Audit finding*: Frontend static fee profiles had specified nonzero `totalMessageFees: "1000000000000000"` with no allocations; `web/src/lib/write.ts` and evidence runners submitted only `distribution` and `feeValue`, dropping `messageAllocations`.
   - **Implementation & Allocation Tree Preservation**:
     - Corrected `fee-profile.json` and `web/src/fee-profile.json` (`totalMessageFees: "0"`).
     - Added `validateTransferAllocations` to `web/src/lib/write.ts`, rejecting nonzero `totalMessageFees` with empty trees and enforcing positive budget allocations for transfer calls.
     - Upgraded `writeIc` and evidence runners to compute fees via supported `client.estimateTransactionFeesForWrite` (Studio devnet simulation) for the concrete call and recipient.
     - Preserves and submits `messageAllocations` alongside `distribution` and `feeValue` to `writeContract`. Fails closed before wallet signing if estimation cannot produce valid allocations (never falls back to generic estimation).
     - Preserved phase timeouts strictly within `[30, 600]` (leader: 200, validator: 400).
   - **Studio Next Preflight Simulation (Without Submitting On-Chain)**:
     - Query: `client.estimateTransactionFeesForWrite` and `simulateWriteContract` with `includeReceipt: true` on contract `0x7Cef756668Cd925807e8B110D0330643c6F809E3`, method `cancel("0x7f24...")`, sender `0x7E4E1f7DcC3DA063F9110477Ad348C90E8599253`.
     - Execution Result: `SUCCESS` (stderr empty)
     - Emitted message: 1 message emitting native transfer of `2000000000000000000 wei` (2.0 GEN) to `0x7E4E1f7DcC3DA063F9110477Ad348C90E8599253`.
     - Fee Accounting: `genvm_message_fee_consumed: 125000000000000 wei`, `message_fee_budget: 150000000000000 wei`, `submitted_messages_count: 1` (672 bytes).
     - Generated Allocation: `recipient: "0x7e4e1f7dcc3da063f9110477ad348c90e8599253"`, `budget: "150000000000000"`, `callKey: "0x0000000000000000000000000000000000000000000000000000000000000000"`.
   - **Live Attempt Authorization & Escrow Preservation**:
     - Time gate check: Current on-chain time (`1791730069` / `2026-10-11T14:48Z`) is before window start / cancel deadline (`2026-10-12 16:17:31 UTC`).
     - Authorization check: Under `contracts/shiplock.py` line 674, `cancel` strictly requires `sender == e.funder`. The connected wallet in the local environment is `shiplock-deployer-live` (`0x20E850BAaD26d763d4f691780D1BEBA01c8D6084`), not the funder (`0x7E4E1f7DcC3DA063F9110477Ad348C90E8599253`).
     - In strict adherence to prompt criteria ("only if on-chain time is still before 2026-10-12 16:17:31 UTC and the connected wallet is its funder"), unauthorized cancel submission is withheld.
     - Escrow `0x7f24...` remains safely `OPEN` on-chain with 2.0 GEN locked, preserved for user browser cancel via the updated frontend or its later settlement path.
   - **Verified GitHub Commit & Vercel Production Deployment**:
     - **Fix Commit SHA**: [`4995078`](https://github.com/edwarderlick/shiplock/commit/4995078) (pushed and verified on `origin/main`).
     - **Vercel Production Deployment ID**: `dpl_5KUjzPzsdHNxMaJWMTkXYCTQtHHs` (confirmed via Vercel inspect as `● Ready`, target `production`, mapped to [`https://shiplock-chi.vercel.app`](https://shiplock-chi.vercel.app)).

5. **Cross-Boundary Release Fee Safety & Two-Recipient Allocation Tree Architecture**:
   - **Hazard Trace**:
     The contract can leave an escrow `OPEN` for an in-window 404 (`EARLY_404_RETRYABLE`), emitting 0 messages. The exact same `release(id)` transaction produces `REFUND_NOHIT` (`WINDOW_EXPIRED_NO_RELEASE`) and calls `emit_transfer(escrow.funder)` if it executes after `window_end`. A pre-submit Studio simulation at $t < \text{window\_end}$ observes the early 404 branch and returns no messageAllocations (`[]`). Submitting that quote causes GenVM to abort with `Mode1MessageFeesRequireGenVMPerEmissionSupport` if consensus execution crosses the deadline.
   - **Two-Recipient Allocation Tree (`buildReleaseMessageAllocations`)**:
     To guarantee that every `release(id)` transaction is safe for every outcome consensus can reach (recipient payout, early 404 retryable, or funder refund), `web/src/lib/write.ts`, `scripts/evidence_helper.mjs`, `scripts/settle_404_escrows.mjs`, and `scripts/release_candidate_escrows.mjs` construct a complete 2-root allocation tree:
     ```typescript
     const messageAllocations = buildReleaseMessageAllocations({
       recipient: escrow.recipient,
       funder: escrow.funder,
       budget: 150000000000000n, // 150,000 Gwei per root node
     });
     ```
     - Root Node 0 (`recipientNode`): `parentIndex: MESSAGE_ALLOCATION_ROOT_PARENT_INDEX`, `recipient: escrow.recipient`, budget `150000000000000n`.
     - Root Node 1 (`funderNode`): `parentIndex: MESSAGE_ALLOCATION_ROOT_PARENT_INDEX`, `recipient: escrow.funder`, budget `150000000000000n`.
   - **Authoritative Fee Estimation**:
     `client.estimateTransactionFees` computes authoritative `distribution` (`totalMessageFees: 300000000000000n`) and `feeValue` incorporating network policy for both potential transfers.
   - **Fail-Closed Validation (`validateTransferAllocations`)**:
     Enforces that `release` message allocations contain root allocations covering both `escrow.recipient` and `escrow.funder`. Rejects empty allocations or single-recipient quotes with a clear local error before wallet signing or transaction submission.
   - **Explicit Verification Qualification**:
     > [!IMPORTANT]
     > **The cross-boundary test in `web/test/flow.test.ts` and `tests/test_evidence_harness.mjs` is mocked and simulated in runtime test harnesses, and fee estimation via `scripts/preflight_studio_check.mjs` is strictly read-only. Neither is a live refund proof.** No time-gated release or refund transaction has been executed early on-chain. Live in-window 404 proofs and final refund settlement proofs remain strictly time-gated and require live on-chain execution after their respective windows open.

---

## 3. Fail-Closed Evidence Harness Architecture

To guarantee that rerun, timeout, or interruption never results in double-submission, state corruption, or false verification claims, both runners (`settle_404_escrows.mjs` and `release_candidate_escrows.mjs`) implement strict safety invariants via [`scripts/evidence_helper.mjs`](scripts/evidence_helper.mjs):

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
9. **Explicit Separation of Evidence Facts & Emitted vs. Delivered Distinction (`verifyEmittedTransferOrChildTx`)**:
   - Explicitly separates four distinct facts:
     1. `parentTransactionFinalized`: receipt verified with `FINALIZED` and `FINISHED_WITH_RETURN`.
     2. `escrowStateEconomicsChanged`: on-chain escrow state and economics deltas verified against baseline snapshot.
     3. `matchingTransferMessageEmitted`: matching GenVM message found in `txInfo.messages` with exact recipient and amount.
     4. `fundsDelivered`: true ONLY when a finalized child transaction receipt is proven on-chain.
   - **Matching Message Never Proves Delivery**: A matching transfer message alone is never reported as delivered funds. If a finalized child transaction is unavailable, delivery is recorded as `MESSAGE_EMITTED_PENDING_DELIVERY` (`fundsDelivered: false`, `deliveryEvidence: null`).
   - **No Field Substitution**: Never substitutes expected recipient or amount for missing transaction fields; both recipient and value must be explicitly present on the child transaction or message object.
   - **Fail-Closed on Absence**: Throws an error if neither a matching emitted message nor a verifiable child/transfer exists.
10. **Delivery Lookup Retry on Restart Reconciliation**:
    - On restart reconciliation, the harness retries delivery lookup via SDK `getTriggeredTransactionIds` and parent `triggered_transactions` even when no child hash was present on the first run.
    - If a child transaction is discovered and finalized, delivery evidence is upgraded to `DELIVERED` (`fundsDelivered: true`) without resubmitting or modifying the finalized parent transaction.
11. **Truthful Settlement Reporting for Already-Settled Escrows**:
    - In `scripts/settle_404_escrows.mjs`, removes any path that sets `refundSettlementVerified = true` solely because `get_escrow` returns `REFUND_NOHIT`.
    - An already settled escrow must not receive a fabricated transaction proof or default match reason/amount.
    - If its actual transaction and economics cannot be reconstructed, reports `SETTLED_ON_CHAIN_PROOF_INCOMPLETE` (`proofIncomplete: true`, `refundSettlementVerified: false`) and submits no duplicate write.
    - The same truthful reporting rule applies to already `RELEASED` candidate escrows in `scripts/release_candidate_escrows.mjs`.
12. **Fail-Closed Studio Next RPC Block Time Checking (`getRpcTime`)**:
    - Runners recheck RPC block timestamp via `eth_getBlockByNumber("latest")` immediately before evaluating time gates and immediately before each timed write (`failClosed: true`).
    - If the RPC timestamp cannot be obtained, timed writes fail closed rather than silently falling back to local clock time.
13. **Full On-Chain Economics Reconciliation Over All Escrows (`scripts/preflight_studio_check.mjs`)**:
    - Queries `get_escrow_ids()` from the contract and reconciles economics against every on-chain escrow returned by the contract (currently 7 escrows).
    - Separately validates each steward evidence escrow from `ESCROWS_TO_CHECK` (ID presence, principal, stage-aware lifecycle status, and Mode 1 allocation construction/authoritative fee estimation).
    - Unrelated or new public-app escrows do not cause false preflight failures.

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
- PyPI: [`packages/shiplock-steward-release-live/pypi/`](packages/shiplock-steward-release-live/pypi/) (`pyproject.toml`, `README.md`, `__init__.py`)
- npm: [`packages/shiplock-steward-release-live/npm/`](packages/shiplock-steward-release-live/npm/) (`package.json`, `README.md`, `index.js`)

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

- **Scope**: Repository working-tree files subject to the exclusions below were scanned using [`scripts/audit_secrets.py`](scripts/audit_secrets.py) specifically for PEM private-key blocks (`-----BEGIN ... KEY-----`) and 32-byte hex candidate strings (`0x[0-9a-fA-F]{64}`).
- **Excluded Categories**: Ignored build and dependency directories (`.git`, `node_modules`, `.next`, `__pycache__`, `.pytest_cache`, `.vercel`) as well as local secret/keystore files (`.deployer_keystore.json`, `.env.local`, `keystore.json`) that are excluded from version control via `.gitignore`.
- **Findings Breakdown**:
  - **Sensitive PEM Private-Key Blocks**: **0 found**.
  - **Informational 32-byte Hex Candidates**: **45 found**.
- **Candidate Verification**: All 45 informational 32-byte hex candidates were manually reviewed and verified as documented on-chain transaction hashes, escrow IDs, or zero/placeholder hashes recorded in documentation and evidence fixtures (`EVIDENCE.md`, `README.md`, `TESTCASES.md`, `scripts/preflight_studio_check.mjs`, `scripts/steward_evidence.json`). None represent private keys, seed phrases, or sensitive credentials.
- **Audit Limitations & Scope Boundaries**: The scanner tests only for PEM private key headers and 32-byte hex strings. It does not scan for passwords, API tokens, or arbitrary secrets, and it excludes local environment files and keystores.

---

## 7. Verification Test Matrix

| Test Suite | Scope | Result |
|---|---|---|
| `python -m pytest tests/direct -q` | Direct contract unit tests | **35 passed** |
| `python -m pytest tests/test_deployer_keystore.py -v` | Keystore & address preservation | **13 passed** |
| `python -m pytest` | **Combined Python test suite** | **48 passed** |
| `node --test tests/test_evidence_harness.mjs` | PyPI urls parsing, candidate release, baseline snapshots, recovery, strict early 404, temporary failure retry lifecycle, refund settlement, Mode 1 transfer fee allocation trees, cross-boundary reconciliation, emitted transfers & child transactions, SDK triggered lookup, explicit fact separation (message vs delivered), restart delivery lookup, fail-closed RPC time, truthful reporting on already-settled state, all on-chain escrows economics reconciliation | **55 passed** (10 suites) |
| `npm --prefix web test` | Frontend flow & contract runtime tests (phase timeout bounds, Mode 1 transfer fee allocation trees, two-recipient release allocation path, cross-boundary release safety, ActionModal polling) | **69 passed** (15 suites) |
| `node scripts/preflight_studio_check.mjs` | Read-only live preflight on Studio Next: contract economics reconciled across all 7 on-chain escrows; all 6 steward escrows validated (allocation builds & authoritative fee estimations verified) | **All 7 on-chain escrows reconciled & all 6 steward escrows verified (Read-only)** |
| `npm --prefix web run lint` | ESLint static analysis | **0 errors** (18 warnings) |
| `npm --prefix web run build` | Next.js production build | **Compiled successfully** |
| `python scripts/audit_secrets.py` | Secret audit (PEM keys & 32-byte hex candidates) | **0 PEM keys; 45 informational 32-byte hex candidates (reviewed transaction/escrow hashes; excludes local env/keystores)** |
| `https://shiplock-chi.vercel.app/` | Live Vercel production deployment (`dpl_F5RHC4RAd9c1MHXfsspfiLxJ1eGm`) | **Verified live (HTTP 200)** |

---

## 8. Milestone v2: Source-Linked Verified Release (Pending Live Verification)

### Overview
Milestone v2 introduces the **Source-Linked Verified Release** policy (`SOURCE_LINKED`) via `fund_verified_escrow` on `contracts/shiplock.py`. Validators query both the official package registry (npm or PyPI) and independent GitHub release evidence (`https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}`), verifying publication in the UTC window, repository source matching, and exact tag alignment.

### Automated Test Suite Parity (Milestone v2)
| Test Suite | Scope | Result |
|---|---|---|
| `python -m pytest tests/direct -q` | Direct contract unit tests (including 9 verified release suites) | **44 passed** |
| `python -m pytest tests/test_deployer_keystore.py -v` | Keystore & address preservation | **13 passed** |
| `python -m pytest` | **Combined Python test suite** | **57 passed** |
| `node --test tests/test_evidence_harness.mjs` | Evidence harness + Suite 10 dual-source release consensus & attack simulation | **60 passed** (11 suites) |
| `npm --prefix web test` | Frontend flow + Section 8 verified escrow validation & preimage derivation | **74 passed** (16 suites) |
| `npm --prefix web run lint` | ESLint static analysis | **0 errors** (18 warnings) |
| `npm --prefix web run build` | Next.js 16 production build | **Compiled successfully (Turbopack)** |
| `python scripts/audit_secrets.py` | Secret audit (PEM keys & 32-byte hex candidates) | **0 PEM keys; 45 informational 32-byte hex candidates (reviewed transaction/escrow hashes; excludes local env/keystores)** |

### Live Verification Steps & Pending Placeholders
The following operational steps require live on-chain execution and deployment for Milestone v2:

| Parameter | Value / Placeholder | Status |
|---|---|---|
| **Accepted Baseline HEAD SHA** | `0617a800a0cabde7d1e324df110bfd3c8b7ac138` | Established baseline |
| **Final Milestone Commit SHA** | `[PENDING: orchestrator commit]` | Pending commit creation |
| **GitHub Compare URL** | `[PENDING: https://github.com/edwarderlick/shiplock/compare/0617a80...<final-sha>]` | Pending compare link |
| **Milestone v2 Contract Address** | `[PENDING: deploy contracts/shiplock.py to Studio Next]` | Pending on-chain deployment |
| **Deployment Transaction** | `[PENDING: deployment transaction hash]` | Pending deployment |
| **Live Verified Escrow ID** | `[PENDING: fund_verified_escrow on Studio Next]` | Pending funding transaction |
| **Successful Release Tx** | `[PENDING: in-window verified release transaction]` | Pending in-window settlement |
| **Child Transfer Tx** | `[PENDING: emitted child transfer transaction]` | Pending settlement execution |
| **Negative Mismatch Proof Tx** | `[PENDING: negative mismatch settlement transaction]` | Pending post-window test |
| **Live Web App Deployment** | `[PENDING: Vercel production deployment of Milestone v2]` | Pending frontend deploy |
