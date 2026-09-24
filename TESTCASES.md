# ShipLock testcases

## Network
- Studio Next / studio-dev
- Chain ID 61997
- RPC https://studio-dev.genlayer.com/api
- Explorer https://explorer-studio-dev.genlayer.com/
- Contract: 0xc7464f6d5F14559f878528730333D74481c4d00f

## Automated (must run)
Command: `python -m pytest tests/direct -q`
Last line: `25 passed in 8.80s`

| Test Function | Expected Result | Pass/Fail |
|---------------|-----------------|-----------|
| `test_fund_escrow_creates_correctly` | id hashes, 24h gate, 14-day cap, latest/url reject | PASS |
| `test_funder_equals_recipient_reverts` | recipient!=funder | PASS |
| `test_get_escrow_returns_data` | can fetch | PASS |
| `test_cancel_allowed_before_start` | cancel before start | PASS |
| `test_cancel_fails_after_start` | cancel after start reverts | PASS |
| `test_release_fails_before_window` | release before window | PASS |
| `test_release_fails_funder` | funder cannot release | PASS |
| `test_release_pypi_200_valid_window` | RELEASED in-window | PASS |
| `test_release_pypi_yanked` | yanked REFUND_NOHIT | PASS |
| `test_release_pypi_404` | 404 REFUND_NOHIT | PASS |
| `test_release_pypi_500` | 5xx INSUFFICIENT | PASS |
| `test_release_pypi_non_json` | non-json INSUFFICIENT | PASS |
| `test_double_release_reverts` | double release reverts | PASS |
| `test_expire_fails_before_end` | expire boundaries | PASS |
| `test_expire_succeeds_after_end` | expire boundaries | PASS |
| `test_get_escrow_fake_id_reverts` | fake id | PASS |
| `test_withdraw_credit` | withdraw emit-then-clear or no-credit | PASS |
| `test_list_ids` | list_ids | PASS |
| `test_get_economics` | economics | PASS |

## Live smoke already proven (do not upgrade these)
Use only what the operator already did on localhost:
- Wallet connect on 61997, no auto-connect
- fund_escrow PYPI_VERSION / shiplock-smoke-does-not-exist / 0.0.0-smoke.1
  recipient != funder, window start ≥ +24h, amount 2 GEN
  → OPEN, hash id
- Amount renders as 2 GEN not wei
- Funder sees Cancel, not Release, before window
- Cancel once → CANCELED, 2 GEN back to funder wallet,
  button disappears, second cancel not offered

## Live cases for a steward / operator
1. Connect any injected wallet, switch to 61997.
2. Fund future-ship 404 package (copy the smoke values above).
3. Confirm /browse and /me show that hash.
4. Cancel as funder before window_start.
5. Optional later: second wallet Release after window_start
   on a 404 package → expect REFUND_NOHIT not RELEASED.
6. Optional: Release on a real published un-yanked version
   whose upload time is inside the window → RELEASED pays recipient.

do not:
- do not use latest
- do not set recipient = funder
- do not Release as funder
- do not treat wallet popup as success
- success = FINALIZED + FINISHED_WITH_RETURN

## Fees
Writes use estimateTransactionFees({
  leaderTimeunitsAllocation: 100n,
  validatorTimeunitsAllocation: 200n,
  rotations: [0n]
})
Note PhaseTimeoutOutOfBounds if someone puts 800 in a timeout field.
