# ShipLock

Time-gated registry-publication escrow on **GenLayer Studio Next**.
A funder locks test GEN against one exact PyPI or npm version plus a UTC window. Anyone may later call `release`. Validators fetch the official registry JSON. The contract pays the recipient only if that version exists, is not yanked, and its publish time sits inside the window. Otherwise it refunds the funder.
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
| **Active Contract** | `0x7Cef756668Cd925807e8B110D0330643c6F809E3` |
| Contract explorer | https://explorer-studio-dev.genlayer.com/address/0x7Cef756668Cd925807e8B110D0330643c6F809E3 |
| Deployment Tx | [`0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854`](https://explorer-studio-dev.genlayer.com/tx/0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854) |
| Source Hash (SHA-256) | `be743c1a8277716d21018911352fe9d7ccd3dd30fb1b8d829d19384133401a0e` (Verified 100% parity) |
| Tests | `python -m pytest tests/direct -q` → **35 passed** |
| Keystore Tests | `python -m pytest tests/test_deployer_keystore.py -v` → **13 passed** |
| Live on-chain smoke | Verified on Studio Next: PyPI & npm escrows created, cancel/refund executed |

## Historical Deployments (Archive)
| Version | Address | Explorer Link | Status |
|---|---|---|---|
| Historical Devnet 2 | `0xF52d9FD2a1542b3F84417a916f3aB4B4631D0b3D` | [Explorer](https://explorer-studio-dev.genlayer.com/address/0xF52d9FD2a1542b3F84417a916f3aB4B4631D0b3D) | Historical (Replaced) |
| Historical Devnet 1 | `0x53EAd6deB8103B278e663Bc9808926FB7B308a63` | [Explorer](https://explorer-studio-dev.genlayer.com/address/0x53EAd6deB8103B278e663Bc9808926FB7B308a63) | Historical (Replaced) |

## What it is / is not
ShipLock is **not** a court, not an appeal board, not a vuln escrow.
Outcomes are only: `OPEN` · `RELEASED` · `REFUND_NOHIT` · `INSUFFICIENT` · `CANCELED` · `EXPIRED`
IDs are `0x` + 64 hex SHA-256 strings. Never `1, 2, 3`.

## Loop
1. `fund_escrow(template, package, version, recipient, start_utc, end_utc)` payable
   Lookback on the official JSON. Already-published or already-yanked → reject. 404 / missing version → allow (future-ship).
   Window start must be ≥ now + 24h. Duration 1–14 days. `recipient != funder`. `latest` and URLs rejected.
2. Before `window_start`, **only the funder** may `cancel` → native refund.
3. Inside the window, **anyone except the funder** may `release`.
   Official fetch:
   - PyPI `https://pypi.org/pypi/{pkg}/{ver}/json`
   - npm `https://registry.npmjs.org/{pkg}/{ver}`
   - 200 + not yanked + publish_time in [start, end] → `RELEASED` pay recipient
   - 404 / miss / yanked / out of window → `REFUND_NOHIT` pay funder
   - 5xx / oversize / non-JSON → `INSUFFICIENT` pay funder (fail closed)
4. After expire instant (`end + 7d`) anyone may `expire` → refund funder.
5. `withdraw` uses `emit_transfer` **before** clearing credit.

## Why GenLayer
The page is live HTTP. Validators fetch it independently. Equivalence is `gl.eq_principle.strict_eq` on a parsed metadata object. Payout is the same consensus write.

## Contract API
Writes: `fund_escrow` (payable) · `cancel` · `release` · `expire` · `withdraw`
Views: `get_escrow` · `list_ids` · `get_economics` · `get_credit`

## Money
`_pay` calls `_Recipient(addr).emit_transfer(value=amount)` **then** updates status / credits. Cancel on the live smoke lock refunded the funder wallet in the same finalized tx.

Fees (frontend):
```typescript
estimateTransactionFees({
  leaderTimeunitsAllocation: 100n,
  validatorTimeunitsAllocation: 200n,
  rotations: [0n],
})
```
Do not put `800` into a phase timeout (Studio Next bounds are 30–600).

## Automated tests
```bash
python -m pytest tests/direct -q
```
**35 passed**.
Covered: hash IDs, 24h / 14d gates, latest/url reject, funder≠recipient, lookback published / yanked / 404, funder cannot release, cancel before start, cancel after start reverts, release before window, RELEASED, yanked and 404 → REFUND_NOHIT, 5xx and non-JSON → INSUFFICIENT, double release, expire bounds, fake id, withdraw ordering, list_ids, economics.
Full matrix: [TESTCASES.md](./TESTCASES.md)

## Live smoke on Studio Next (Chain 61997)
| Step | Action | Tx Hash | Result |
|---|---|---|---|
| Contract Deploy | Deploy `contracts/shiplock.py` | `0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854` | FINALIZED, FINISHED_WITH_RETURN |
| Read Initial State | `list_ids()`, `get_economics()` | RPC Query | 0 escrows, 0 open/paid/refunded |
| Fund PyPI 404 | `fund_escrow` (`shiplock-smoke-does-not-exist`) | `0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312` | OPEN, 0.02 GEN, LOOKBACK_404_OK |
| Fund npm 404 | `fund_escrow` (`shiplock-smoke-does-not-exist-npm`) | `0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617` | OPEN, 0.02 GEN, LOOKBACK_404_OK |
| Cancel & Refund | `cancel` (`shiplock-smoke-cancel-target`) | `0xdb6d919c7b4462d479917e8df1783a6a087053c80e24bf5bce2600f0fc56ab4e` | CANCELED, 0.01 GEN refunded |
| Verify Accounting | `get_economics()` | RPC Query | 0.04 GEN open, 0.01 GEN refunded |

> Time-gated release/refund tests require `now >= window_start` (+24h gate). Active funded test escrows remain OPEN on-chain ready for release tests after `2026-10-12 10:33:18 UTC`.

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
- `NEXT_PUBLIC_CONTRACT_ADDRESS` = `0x7Cef756668Cd925807e8B110D0330643c6F809E3`
- `NEXT_PUBLIC_CHAIN_ID` = `61997`
- `NEXT_PUBLIC_STUDIO_RPC` = `https://studio-dev.genlayer.com/api`
- `NEXT_PUBLIC_EXPLORER` = `https://explorer-studio-dev.genlayer.com`
Framework: Next.js.

## Steward notes already baked in
- Hash IDs, not counters
- `emit_transfer` before credit clear
- Settlement is a real transfer, not a ledger-only wipe
- Funder cannot self-release
- Window + cancel cannot bypass a live challenge once start hits
- Feed failure fail-closed (`INSUFFICIENT`)
- 404 future-ship is allowed at fund, exhaustive at release
- No appeal / passport / leaderboard / court chrome

## License
MIT
