# ShipLock

Time-gated registry-publication escrow on **GenLayer Studio Next**.
A funder locks test GEN against one exact PyPI or npm version plus a UTC window. Anyone may later call `release`. Validators fetch the official registry JSON. The contract pays the recipient only if that version exists, is not yanked, and its publish time sits inside the window. Otherwise it refunds the funder.
Same write. No docket. No appeal UI. No court.

> This is a Studio Next testnet app. Bonds are test GEN with no real value.

## Submission

| | |
|---|---|
| GitHub | https://github.com/edwarderlick/shiplock |
| Live app | *(add Vercel URL after deploy)* |
| Network | Studio Next / studio-dev |
| Chain ID | 61997 (`0xF22D`) |
| RPC | https://studio-dev.genlayer.com/api |
| Explorer | https://explorer-studio-dev.genlayer.com/ |
| **Contract** | `0xc7464f6d5F14559f878528730333D74481c4d00f` |
| Contract explorer | https://explorer-studio-dev.genlayer.com/address/0xc7464f6d5F14559f878528730333D74481c4d00f |
| Tests | `python -m pytest tests/direct -q` → **25 passed** |
| Manual proof | fund 2 GEN OPEN → funder Cancel → CANCELED + native refund |

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
**25 passed** after aligning the funder=recipient message with `UserError('recipient equals funder')`.
Covered: hash IDs, 24h / 14d gates, latest/url reject, funder≠recipient, lookback published / yanked / 404, funder cannot release, cancel before start, cancel after start reverts, release before window, RELEASED, yanked and 404 → REFUND_NOHIT, 5xx and non-JSON → INSUFFICIENT, double release, expire bounds, fake id, withdraw ordering, list_ids, economics.
Full matrix: [TESTCASES.md](./TESTCASES.md)

## Live smoke (localhost, 2026-09-24)
| Step | Result |
|---|---|
| Connect injected wallet, chain 61997 | pass |
| Fund `PYPI_VERSION` / `shiplock-smoke-does-not-exist` / `0.0.0-smoke.1` / 2 GEN / other recipient / start ≥ +24h | OPEN, hash id |
| UI amount | `2 GEN` not wei |
| Funder before window | Cancel visible, Release hidden |
| Cancel once | CANCELED, 2 GEN back to **funder**, button removed |

Live `release` / `expire` not run on Studio Next (24h gate). Those branches are the direct tests above. After `window_start`, a **second** wallet should Release the 404 package and get `REFUND_NOHIT`.

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
- `NEXT_PUBLIC_CONTRACT_ADDRESS` = `0xc7464f6d5F14559f878528730333D74481c4d00f`
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
