# ShipLock Testcases

## Network Configuration
- **Network**: Studio Next (`studio-dev`)
- **Chain ID**: `61997` (`0xF22D`)
- **Canonical RPC**: `https://studio-dev.genlayer.com/api`
- **Block Explorer**: `https://explorer-studio-dev.genlayer.com/`
- **Active Contract**: `0x7Cef756668Cd925807e8B110D0330643c6F809E3`
- **Active Deployment Tx**: [`0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854`](https://explorer-studio-dev.genlayer.com/tx/0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854)
- **Historical Reference**: `0xF52d9FD2a1542b3F84417a916f3aB4B4631D0b3D`, `0x53EAd6deB8103B278e663Bc9808926FB7B308a63`

---

## Automated Contract Tests (Direct Test Suite)
Command: `python -m pytest tests/direct -q`
Result: **43 passed** (direct tests) · `python -m pytest` → **56 passed** (combined)

| # | Test Function | Expected Result | Pass/Fail |
|---|---|---|---|
| 1 | `test_deterministic_ids_reproducible_across_runs_and_distinct_nonces` | Deterministic SHA-256 hash IDs (`0x` + 64 hex characters) reproducible across runs; distinct nonces generate distinct IDs | PASS |
| 2 | `test_five_concurrent_fund_distinct_hash_ids` | Five concurrent fund calls produce 5 distinct 66-character hex hash IDs | PASS |
| 3 | `test_early_404_remains_open_no_transfer_then_later_pypi_success` | In-window 404 check before window_end leaves escrow `OPEN` (`EARLY_404_RETRYABLE`) with zero transfers and untouched economics; later retry after publish settles to `RELEASED` | PASS |
| 4 | `test_unexpected_http_statuses_leave_open_before_and_after_window` | Unexpected HTTP statuses (429, 403, 301, 500) leave escrow `OPEN` before window (`EARLY_TEMPORARY_FAILURE`/`EARLY_UNAVAILABLE_RETRYABLE`) and after window (`POST_WINDOW_UNAVAILABLE`); never triggers premature refund or `INSUFFICIENT` | PASS |
| 5 | `test_fund_escrow_permit_only_verified_absent` | Lookback permits only verified 404 or unreleased package version; reverts on published, yanked, or inconclusive lookbacks | PASS |
| 6 | `test_npm_deprecated_version_is_released_not_yanked` | npm package with `deprecated` field warning is treated as valid release (`RELEASED`), not yanked | PASS |
| 7 | `test_realistic_large_npm_response_and_oversize_cap` | Handles realistic large npm payloads; responses exceeding 256 KiB cap leave escrow `OPEN` without fund transfers | PASS |
| 8 | `test_now_dt_fails_explicitly_when_tx_timestamp_unavailable` | Fails explicitly with `UserError` when transaction timestamp is unavailable in context | PASS |
| 9 | `test_scoped_npm_package_success` | Handles scoped npm packages (e.g. `@scope/pkg`) successfully settling to `RELEASED` in-window | PASS |
| 10 | `test_no_hit_refund_boundary_at_window_end` | Exact boundary test: 1s before window_end leaves escrow `OPEN` (`EARLY_404_RETRYABLE`) with no transfers; at or after window_end settles to `REFUND_NOHIT` (`WINDOW_EXPIRED_NO_RELEASE`) paying funder | PASS |
| 11 | `test_in_window_publish_timestamp_settles_after_window_end` | Artifact published inside `[window_start, window_end]` settles to `RELEASED` paying recipient even when release is called after window_end (before `expire_at`) | PASS |
| 12 | `test_pypi_multi_file_earliest_non_yanked_selected` | PyPI package with multiple distribution files selects earliest non-yanked upload timestamp from `urls[]` | PASS |
| 13 | `test_release_yanked_refunds_funder` | Verified yanked version at or after window_end triggers `REFUND_NOHIT` (`YANKED`) paying funder | PASS |
| 14 | `test_economics_for_every_state_transition` | Verifies global on-chain accounting (`escrowed_open`, `paid_to_recipients`, `refunded_to_funders`) across all lifecycle state transitions | PASS |
| 15 | `test_fund_inside_window_reverts` | Rejects funding when `window_start` is in the past or inside the active window | PASS |
| 16 | `test_fund_less_than_24h_before_start_reverts` | Rejects funding when `window_start` is less than 24 hours from current timestamp | PASS |
| 17 | `test_window_over_14_days_reverts` | Rejects window durations longer than 14 days | PASS |
| 18 | `test_latest_and_url_in_name_revert` | Rejects 'latest' or URL substrings in package name or version | PASS |
| 19 | `test_funder_equals_recipient_reverts` | Rejects funding when recipient address equals funder address | PASS |
| 20 | `test_funder_release_reverts` | Reverts when funder attempts to call `release` on their own escrow | PASS |
| 21 | `test_cancel_after_start_reverts` | Reverts when funder calls `cancel` at or after `window_start` | PASS |
| 22 | `test_release_before_window_reverts` | Reverts when `release` is called before `window_start` | PASS |
| 23 | `test_release_twice_reverts` | Reverts with "not OPEN" on attempting to release an already settled escrow | PASS |
| 24 | `test_expire_before_grace_reverts_after_grace_refunds` | Reverts when `expire` is called before `window_end + 7d` grace period; succeeds and refunds funder after grace period | PASS |
| 25 | `test_list_ids_matches_get_escrow_ids` | Confirms `list_ids()` returns all tracked escrow IDs matching internal escrow map keys | PASS |
| 26 | `test_withdraw_no_credit_reverts` | Reverts when calling `withdraw` with zero credit balance | PASS |
| 27 | `test_matching_application_flow_end_to_end` | Full end-to-end flow: lookback fund, in-window release payout, recipient credit withdrawal via `emit_transfer`, and final state assertions | PASS |
| 28 | `test_npm_missing_time_timestamp_inconclusive_leaves_open_no_transfer` | npm response missing `time` timestamp is inconclusive; leaves escrow `OPEN` with zero transfer | PASS |
| 29 | `test_npm_missing_versions_object_inconclusive_leaves_open_no_transfer` | npm response missing `versions` object is inconclusive; leaves escrow `OPEN` with zero transfer | PASS |
| 30 | `test_npm_mismatched_version_object_or_invalid_time_inconclusive` | npm response with version mismatch or invalid ISO time format leaves escrow `OPEN` with zero transfer | PASS |
| 31 | `test_pypi_empty_urls_does_not_use_info_timestamp_leaves_open` | PyPI response with empty `urls[]` does not use `info` timestamp; leaves escrow `OPEN` with zero transfer | PASS |
| 32 | `test_pypi_unusable_file_timestamp_leaves_open` | PyPI response with unusable file timestamps leaves escrow `OPEN` with zero transfer | PASS |
| 33 | `test_fund_escrow_rejects_incomplete_evidence` | `fund_escrow` lookback rejects incomplete HTTP 200 responses (e.g. empty PyPI `urls[]` or missing npm `time[ver]`) | PASS |
| 34 | `test_final_nohit_allowed_for_verified_timestamp_outside_window` | At or after window_end, verified publication strictly outside window settles to `REFUND_NOHIT` (`PUBLISHED_AFTER_WINDOW` or `PUBLISHED_BEFORE_WINDOW`) paying funder | PASS |
| 35 | `test_npm_missing_or_malformed_versions_or_time_maps_cannot_fund_or_refund` | Minimal npm payload lacking `versions`/`time` maps is inconclusive; rejects `fund_escrow` and leaves escrow `OPEN` (`POST_WINDOW_INCONCLUSIVE`) after window_end | PASS |
| 36 | `test_verified_escrow_input_validation_and_rejections` | Rejects invalid GitHub owner/repo (traversal, schemes, queries, fragments, whitespace, control chars, lengths) and tags (slashes, traversal, ref characters, whitespace, bounds) | PASS |
| 37 | `test_verified_escrow_deterministic_id_and_audit_fields` | Verifies 11-element preimage SHA-256 derivation and complete audit view (`policy`, `expected_repo`, `expected_tag`, `package`, `package_name`, `version`, `match_reason`) | PASS |
| 38 | `test_npm_verified_release_success` | Full dual-source verified release: npm package + matching GitHub repository + exact release tag in window settles to `RELEASED` (`VERIFIED_RELEASE`) and pays recipient | PASS |
| 39 | `test_pypi_verified_release_success` | Full dual-source verified release: PyPI package + matching GitHub repository (`project_urls`) + exact release tag in window settles to `RELEASED` (`VERIFIED_RELEASE`) and pays recipient | PASS |
| 40 | `test_verified_escrow_active_window_mismatches_stay_open` | Active window repository mismatch (`EARLY_REGISTRY_MISMATCH_RETRYABLE`) or tag mismatch (`EARLY_GITHUB_TAG_MISMATCH_RETRYABLE`) leaves escrow `OPEN` and retryable | PASS |
| 41 | `test_verified_escrow_active_window_failures_and_transport_stay_open` | Active window GitHub 404 (`EARLY_GITHUB_404_RETRYABLE`), rate limits 403/429 (`EARLY_GITHUB_UNAVAILABLE_RETRYABLE`), server 500, or invalid JSON leave escrow `OPEN` | PASS |
| 42 | `test_verified_escrow_post_window_settlement_and_inconclusive_safety` | Post-window conclusive mismatch settles to `REFUND_NOHIT` (`REGISTRY_REPO_MISMATCH` or `WINDOW_EXPIRED_GITHUB_NO_RELEASE`) paying funder; inconclusive transport error leaves escrow `OPEN` (`POST_WINDOW_GITHUB_UNAVAILABLE`) | PASS |
| 43 | `test_verified_escrow_security_and_double_settlement` | Funder cannot release their own verified escrow; double release reverts; double refund reverts; economics remain exact across all verified state transitions | PASS |

---

## Live On-Chain Smoke Escrows (Studio Next, Chain 61997)
Verified on-chain escrows on the active contract (`0x7Cef756668Cd925807e8B110D0330643c6F809E3`):

1. **PyPI 404 Smoke Escrow**:
   - Escrow ID: `0x1ac2eea7c83967a0abe667355598d3809fb2552cc5d4227ad7ba86fee09a3c46`
   - Package: `shiplock-smoke-does-not-exist` @ `0.0.0-smoke.1`
   - Amount: `0.02 GEN` locked
   - Status: `OPEN` (`LOOKBACK_404_OK`)
   - Fund Tx: [`0x6a307ceab940...`](https://explorer-studio-dev.genlayer.com/tx/0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312)

2. **npm 404 Smoke Escrow**:
   - Escrow ID: `0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e`
   - Package: `shiplock-smoke-does-not-exist-npm` @ `0.0.0-smoke.1`
   - Amount: `0.02 GEN` locked
   - Status: `OPEN` (`LOOKBACK_404_OK`)
   - Fund Tx: [`0xd25c4478f9be...`](https://explorer-studio-dev.genlayer.com/tx/0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617)

3. **Canceled Smoke Escrow**:
   - Escrow ID: `0xd450d74c9eee0d8ff4d92983bfc79ee55f01ef3609c4e6d0dd5fcb0c8867c2a3`
   - Package: `shiplock-smoke-cancel-target` @ `0.0.0-smoke.1`
   - Amount: `0.01 GEN`
   - Status: `CANCELED` (100% native refund `0.01 GEN` returned to funder wallet in finalized transaction via `emit_transfer`)
   - Fund Tx: [`0x2ce8683d...`](https://explorer-studio-dev.genlayer.com/tx/0x2ce8683d5762d9b322b1a91ef0f1bc4f70cdbfabb4267a42a6e26f47951c640e)
   - Cancel Tx: [`0xdb6d919c...`](https://explorer-studio-dev.genlayer.com/tx/0xdb6d919c7b4462d479917e8df1783a6a087053c80e24bf5bce2600f0fc56ab4e)

4. **PyPI Release Candidate Escrow**:
   - Escrow ID: `0xdc2dfac858eb5b61fa66258c73656c9a9d7008102604618e57933fe5f98bfbe3`
   - Package: `shiplock-steward-release-live` @ `1.0.0`
   - Amount: `0.01 GEN` locked
   - Status: `OPEN` (`LOOKBACK_404_OK`)
   - Fund Tx: [`0x0f09d238...`](https://explorer-studio-dev.genlayer.com/tx/0x0f09d23831be1fb344b135c09cb674529e4caa5c607fe665988b5da80d342cc6)

5. **npm Release Candidate Escrow**:
   - Escrow ID: `0x3c46e617d6541f63e69f783c0a481f429bb9c7e08509274ebbef25fc1b8444ad`
   - Package: `shiplock-steward-release-live` @ `1.0.0`
   - Amount: `0.01 GEN` locked
   - Status: `OPEN` (`LOOKBACK_404_OK`)
   - Fund Tx: [`0xb627438c...`](https://explorer-studio-dev.genlayer.com/tx/0xb627438c2bb6190960b9eea4c4acb8f09847e14aa02e0b4b219056437bd30a01)

---

## Live Procedures for a Steward / Operator
1. Connect any injected wallet, switch to Chain `61997`.
2. To fund a future-ship escrow: Provide template (`PYPI_VERSION` or `NPM_VERSION`), package name, version, recipient address, start time (>= now + 24h), end time (1-14 days duration).
3. Confirm `/browse` and `/me` show the 66-character hash ID and proper GEN amounts.
4. Before `window_start`, only the funder can cancel → native refund via `emit_transfer`.
5. **In-window 404 check (`window_start <= now < window_end`)**:
   Calling `release` from a non-funder account on a still-missing / 404 package leaves the escrow **`OPEN` and retryable** (`EARLY_404_RETRYABLE`). Principal remains untouched, zero payout/refund, and economics remain unchanged. It does **not** refund the funder and does **not** transition to any `INSUFFICIENT` state.
6. **In-window candidate release (`window_start <= now < window_end`)**:
   Publishing the prepared version inside the window and calling `release` transitions the escrow to `RELEASED` (`200_IN_WINDOW`) and pays the recipient (`0.01 GEN`).
7. **Post-window settlement (`now >= window_end`)**:
   Calling `release` on a verified absent package at or after `window_end` transitions the escrow to `REFUND_NOHIT` (`WINDOW_EXPIRED_NO_RELEASE`) and refunds the funder (`0.02 GEN` each).

### Guardrails
- Do NOT use `latest` or URL strings in package name or version.
- Do NOT set recipient = funder.
- Funder cannot call `release` (reverts).
- Do not treat a wallet popup as success: success requires `FINALIZED` transaction receipt with `FINISHED_WITH_RETURN`.

---

## Transaction Fee Guidelines
Frontend writes use `estimateTransactionFees` with:
```typescript
{
  leaderTimeunitsAllocation: 100n,
  validatorTimeunitsAllocation: 200n,
  rotations: [0n],
}
```
Note: Phase timeout values must stay within Studio Next bounds (30–600).
