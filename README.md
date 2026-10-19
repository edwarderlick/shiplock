# ShipLock

Time-gated registry-publication escrow on **GenLayer Studio Next**.
A funder locks test GEN against one exact PyPI or npm version plus a UTC window. Anyone may later call `release`. Validators fetch the official registry JSON. The contract pays the recipient only if that version exists, is not yanked, and its publish time sits inside the window. If the version is not yet published during the window, or if a registry error occurs, the escrow remains `OPEN` and retryable. Final `REFUND_NOHIT` to the funder requires qualifying evidence at or after `window_end` (or verified yanked/out-of-window publication).
Same write. No docket. No appeal UI. No court.

> This is a Studio Next testnet app. Bonds are test GEN with no real value.

## Submission

| | |
|---|---|
| GitHub | https://github.com/edwarderlick/shiplock |
| Live app | https://shiplock-chi.vercel.app/ |
| Network | Studio Next / studio-dev |
| Chain ID | 61997 (`0xF22D`) |
| RPC | https://studio-dev.genlayer.com/api |
| Explorer | https://explorer-studio-dev.genlayer.com/ |
| **Active Contract** | `0xF2110c3E6B170caF10FE953564285C6f01cB1F0c` |
| Contract explorer | https://explorer-studio-dev.genlayer.com/address/0xF2110c3E6B170caF10FE953564285C6f01cB1F0c |
| Deployment Tx | [`0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f`](https://explorer-studio-dev.genlayer.com/tx/0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f) |
| Source Hash (SHA-256) | `860387dc9579aba8d445df9395c4ec80bc425b7b8a3d7b27eed8cc477b59276d` (Verified 100% parity, 51,327 bytes) |
| Tests | `python -m pytest` → **57 passed** (44 direct contract tests + 13 deployer keystore tests) |
| Web Tests | `npm --prefix web test` → **74 passed** (16 suites) |
| Evidence Tests | `node --test tests/test_evidence_harness.mjs` → **60 passed** (11 suites) |
| Milestone Documentation | [MILESTONE_01.md](./MILESTONE_01.md) · [EVIDENCE.md](./EVIDENCE.md) · [TESTCASES.md](./TESTCASES.md) |

## Historical Deployments (Archive)
| Version | Address | Explorer Link | Status |
|---|---|---|---|
| Historical Release v1 | `0x7Cef756668Cd925807e8B110D0330643c6F809E3` | [Explorer](https://explorer-studio-dev.genlayer.com/address/0x7Cef756668Cd925807e8B110D0330643c6F809E3) | Historical (Replaced by v2) |
| Historical Devnet 2 | `0xF52d9FD2a1542b3F84417a916f3aB4B4631D0b3D` | [Explorer](https://explorer-studio-dev.genlayer.com/address/0xF52d9FD2a1542b3F84417a916f3aB4B4631D0b3D) | Historical (Replaced) |
| Historical Devnet 1 | `0x53EAd6deB8103B278e663Bc9808926FB7B308a63` | [Explorer](https://explorer-studio-dev.genlayer.com/address/0x53EAd6deB8103B278e663Bc9808926FB7B308a63) | Historical (Replaced) |

## What it is / is not
ShipLock is **not** a court, not an appeal board, not a vuln escrow.
Outcomes are only: `OPEN` · `RELEASED` · `REFUND_NOHIT` · `CANCELED` · `EXPIRED`
IDs are `0x` + 64 hex SHA-256 strings. Never `1, 2, 3`.

## Loop
1. `fund_escrow(template, package, version, recipient, start_utc, end_utc)` payable
   Lookback on the official JSON. Already-published or already-yanked → reject. Verified 404 / missing version → allow (future-ship). Inconclusive / incomplete evidence → reject.
   Window start must be ≥ now + 24h. Duration 1–14 days. `recipient != funder`. `latest` and URLs rejected.
2. Before `window_start`, **only the funder** may `cancel` → native refund via `emit_transfer`.
3. Inside the window (`window_start <= now < window_end`), **anyone except the funder** may `release`.
   Official fetch:
   - PyPI `https://pypi.org/pypi/{pkg}/{ver}/json` (parsed via `urls[]` upload timestamps)
   - npm `https://registry.npmjs.org/{pkg}/{ver}` (parsed via `time` and `versions` mappings)
   - In-window publication: `200` + not yanked + `publish_time` in `[start, end]` → `RELEASED` pays recipient.
   - Early check / not published yet: HTTP 404 (`EARLY_404_RETRYABLE`), temporary registry failure, 5xx, 429, 403, redirects, oversize, non-JSON, or inconclusive response leaves the escrow **`OPEN` and retryable** with intact funds (no payout, no refund, economics unchanged). It does **not** refund the funder and does **not** enter `INSUFFICIENT`.
4. At or after `window_end` (`now >= window_end`):
   - In-window publication: An artifact published within `[start, end]` still settles as `RELEASED` paying recipient at any time before expiration (`now < expire_at`).
   - Final refund (`REFUND_NOHIT` paying funder): Requires qualifying evidence at or after `window_end`:
     - Verified 404 / package or version does not exist (`WINDOW_EXPIRED_NO_RELEASE`).
     - Verified yanked version (`YANKED`).
     - Verified timestamped publication strictly outside the window (`PUBLISHED_BEFORE_WINDOW` or `PUBLISHED_AFTER_WINDOW`).
   - Registry failures: 5xx, 429, 403, redirects, oversize, non-JSON, or inconclusive responses lacking complete evidence **leave the escrow `OPEN`** (e.g. `POST_WINDOW_UNAVAILABLE`, `POST_WINDOW_INSUFFICIENT_EVIDENCE`), preventing premature or erroneous refunds without conclusive proof.
5. After expire instant (`end + 7d`), anyone may call `expire` → refunds funder.
6. `withdraw` uses `emit_transfer` **before** clearing credit.

## Why GenLayer
The page is live HTTP. Validators fetch it independently. Equivalence is `gl.eq_principle.strict_eq` on a parsed metadata object. Payout is the same consensus write.

## Contract API
Policies: `REGISTRY_ONLY` ("Registry Release") · `SOURCE_LINKED` ("Source-Linked Verified Release")
Writes: `fund_escrow` (payable) · `fund_verified_escrow` (payable) · `cancel` · `release` · `expire` · `withdraw`
Views: `get_escrow` · `list_ids` · `get_economics` · `get_credit`

## Money
`_pay` calls `_Recipient(addr).emit_transfer(value=amount)` **then** updates status / credits. Cancel on the live smoke lock refunded the funder wallet in the same finalized tx.

Fees (frontend & runners):
```typescript
// 1. Non-transfer writes (e.g. fund_escrow):
estimateTransactionFees({
  leaderTimeunitsAllocation: 200n,
  validatorTimeunitsAllocation: 400n,
  rotations: [1n],
});

// 2. Transfer writes with deterministic single recipient (cancel, expire, withdraw):
const { distribution, messageAllocations, feeValue } = await client.estimateTransactionFeesForWrite({
  address: CONTRACT_ADDRESS,
  functionName: "cancel",
  args: [escrowId],
  account: wallet,
  leaderTimeunitsAllocation: 200n,
  validatorTimeunitsAllocation: 400n,
});

// 3. Release transactions: Two-recipient allocation path covering both outcomes:
// Consensus can reach recipient payout (200), early 404 (0 messages), or funder refund (cross-boundary execution).
// We build a complete 2-root allocation tree covering both escrow.recipient and escrow.funder:
const completeAllocations = buildReleaseMessageAllocations({
  recipient: escrow.recipient,
  funder: escrow.funder,
  budget: 150000000000000n, // 150,000 Gwei per root node
});
const { distribution, messageAllocations, feeValue } = await client.estimateTransactionFees({
  leaderTimeunitsAllocation: 200n,
  validatorTimeunitsAllocation: 400n,
  rotations: [1n],
  messageAllocations: completeAllocations,
});
// Enforced via validateTransferAllocations before wallet signing or runner submission.
```
Studio Next consensus bounds phase timeouts to 30–600 timeunits. Allocations outside this range (e.g. 800) revert with `PhaseTimeoutOutOfBounds(alloc,30,600)`. Any fee-bearing emission requires an explicit message allocation tree.

> **Qualification Note**: The cross-boundary tests in `web/test/flow.test.ts` and `tests/test_evidence_harness.mjs` are mocked/simulated, and fee estimation in `scripts/preflight_studio_check.mjs` is strictly read-only. Neither is a live refund proof. Live settlement proofs require execution within their scheduled time windows.

## Automated tests
```bash
# Contract & Keystore Tests (57 passed)
python -m pytest

# Frontend Runtime & Integration Flow (74 passed)
npm --prefix web test

# Fail-Closed Evidence Harness & Dual-Source Verification Tests (60 passed)
node --test tests/test_evidence_harness.mjs
```
Covered: deterministic hash IDs, concurrent distinct IDs, source-linked verified release policy, canonical GitHub repo & tag syntax validation, URL injection protection, dual-source consensus settlement, early 404 leaves OPEN & retryable then settles on later success, unexpected HTTP statuses (429/403/301/500) leave OPEN before and after window, fund lookback permits only verified absent, npm deprecated vs yanked, realistic large npm responses & oversize caps, now_dt explicit timestamp requirement, scoped npm packages, window-end refund boundary, in-window publication settling after window-end, PyPI multi-file earliest non-yanked selection, yanked release refunds funder, economics across all transitions, 24h & 14d gates, latest/url reject, funder≠recipient, funder cannot release, cancel before start, cancel after start reverts, release before window reverts, double release reverts, expire grace bounds, list_ids parity, withdraw ordering, end-to-end matching flow, two-recipient release allocation trees, emitted transfers & child transactions verification, pending child transfer restart reconciliation, Studio Next RPC time gate checks, and fail-closed handling of missing/malformed npm/PyPI metadata leaving escrows OPEN.
Full matrix: [TESTCASES.md](./TESTCASES.md) · Milestone report: [MILESTONE_01.md](./MILESTONE_01.md)

## Live smoke & steward evidence on Studio Next (Chain 61997)
| Step | Action | Tx Hash | Result |
|---|---|---|---|
| Contract Deploy | Deploy `contracts/shiplock.py` | `0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854` | FINALIZED, FINISHED_WITH_RETURN |
| Read Initial State | `list_ids()`, `get_economics()` | RPC Query | 0 escrows, 0 open/paid/refunded |
| Fund PyPI 404 | `fund_escrow` (`shiplock-smoke-does-not-exist`) | `0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312` | OPEN, 0.02 GEN, LOOKBACK_404_OK |
| Fund npm 404 | `fund_escrow` (`shiplock-smoke-does-not-exist-npm`) | `0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617` | OPEN, 0.02 GEN, LOOKBACK_404_OK |
| Cancel & Refund | `cancel` (`shiplock-smoke-cancel-target`) | `0xdb6d919c7b4462d479917e8df1783a6a087053c80e24bf5bce2600f0fc56ab4e` | CANCELED, 0.01 GEN refunded |
| Fund PyPI Candidate | `fund_escrow` (`shiplock-steward-release-live`) | `0x0f09d23831be1fb344b135c09cb674529e4caa5c607fe665988b5da80d342cc6` | OPEN, 0.01 GEN, LOOKBACK_404_OK |
| Fund npm Candidate | `fund_escrow` (`shiplock-steward-release-live`) | `0xb627438c2bb6190960b9eea4c4acb8f09847e14aa02e0b4b219056437bd30a01` | OPEN, 0.01 GEN, LOOKBACK_404_OK |
| Live Funding Proof | `fund_escrow` (`shiplock-live-verify-phase`) | `0xd6f0881c7ac0a3d6f30306e54cc46136c10d3b1a43c46e1c92ab8793e8f55190` | OPEN, 0.01 GEN, LOOKBACK_404_OK |
| Manual Smoke Lock | `fund_escrow` (`shiplock-manual-smoke-20261011-samir`) | `0x7f24e638ea5ed353c377f968352fdf9d2e1c66959fa739fa69d1d32e54d58d53` | OPEN, 2.00 GEN locked (Preflight verified) |
| Verify Accounting | `get_economics()` | RPC Query | 2.07 GEN open, 0.01 GEN refunded |

> Historical snapshot (pre-funding-proof, 2026-10-11 11:38 UTC): 0.06 GEN open (`60000000000000000 wei`), 0.01 GEN refunded.  
> Active on-chain snapshot (post-manual-lock, 2026-10-11 14:48 UTC): 2.07 GEN open (`2070000000000000000 wei`), 0.01 GEN refunded.

> Complete reproducible report, time-gate windows, and cleanup audit: [EVIDENCE.md](./EVIDENCE.md).
> Time-gated release/refund tests require `now >= window_start` (+24h gate). Active funded test escrows remain OPEN on-chain ready for in-window checks after `2026-10-12 10:33:18 UTC` and final refund after `2026-10-14 10:33:18 UTC`.

## Local app
```bash
cd web
cp .env.example .env.local
npm ci
npm run dev
```
Open http://localhost:3000
Wallet must be on chain 61997. Faucet: Studio Next account dropdown.

## Vercel
Root directory: `web`
Env (Production + Preview):
- `NEXT_PUBLIC_CONTRACT_ADDRESS` = `0xF2110c3E6B170caF10FE953564285C6f01cB1F0c`
- `NEXT_PUBLIC_CHAIN_ID` = `61997`
- `NEXT_PUBLIC_STUDIO_RPC` = `https://studio-dev.genlayer.com/api`
- `NEXT_PUBLIC_STUDIO_EXPLORER` = `https://explorer-studio-dev.genlayer.com`
Framework: Next.js.

## Steward notes already baked in
- Hash IDs, not counters
- `emit_transfer` before credit clear
- Settlement is a real transfer, not a ledger-only wipe
- Funder cannot self-release
- Window + cancel cannot bypass a live challenge once start hits
- Feed failures & early 404s fail-safe: leave escrow OPEN & retryable, never premature refund or INSUFFICIENT
- 404 future-ship is allowed at fund, qualifying evidence required at or after window_end for final REFUND_NOHIT
- No appeal / passport / leaderboard / court chrome

## License
MIT
