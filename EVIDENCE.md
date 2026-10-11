# ShipLock Steward Evidence & Repository Audit Report

**Network**: GenLayer Studio Next (`studio-dev`) | **Chain ID**: `61997` (`0xF22D`)  
**Active Contract**: `0x7Cef756668Cd925807e8B110D0330643c6F809E3`  
**Production Web App**: https://shiplock-chi.vercel.app/  
**Explorer Address**: https://explorer-studio-dev.genlayer.com/address/0x7Cef756668Cd925807e8B110D0330643c6F809E3  
**Report Generated**: October 11, 2026  

---

## 1. Executive Summary & On-Chain Parity

ShipLock is an immutable, time-gated package registry publication escrow deployed to GenLayer Studio Next. Escrow conditions are settled using GenLayer's consensus and decentralized oracle execution against official public package registry endpoints (`pypi.org` and `registry.npmjs.org`).

### Verified Active Configuration
| Parameter | Value | Verification |
|---|---|---|
| **Active Contract Address** | `0x7Cef756668Cd925807e8B110D0330643c6F809E3` | Confirmed active on Studio Next |
| **Deployment Transaction** | [`0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854`](https://explorer-studio-dev.genlayer.com/tx/0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854) | Status: `FINALIZED`, Execution: `FINISHED_WITH_RETURN` |
| **Deployer Wallet** | `0x20E850BAaD26d763d4f691780D1BEBA01c8D6084` | Funded via Studio Next faucet |
| **Source SHA-256 Hash** | `be743c1a8277716d21018911352fe9d7ccd3dd30fb1b8d829d19384133401a0e` | 100% parity with local `contracts/shiplock.py` |
| **Production Web URL** | https://shiplock-chi.vercel.app/ | Badge displays `0x7Cef...09E3` |
| **RPC Endpoint** | `https://studio-dev.genlayer.com/api` | Canonical Studio Next RPC |

### Live On-Chain Economics (`get_economics()`)
Snapshot read directly from contract `0x7Cef756668Cd925807e8B110D0330643c6F809E3`:
- **Escrowed Open**: `0.06 GEN` (`60000000000000000 wei`)
  - PyPI 404 Smoke Escrow: `0.02 GEN`
  - npm 404 Smoke Escrow: `0.02 GEN`
  - PyPI Release Candidate Escrow: `0.01 GEN`
  - npm Release Candidate Escrow: `0.01 GEN`
- **Outstanding Credits**: `0 GEN`
- **Paid to Recipients**: `0 GEN`
- **Refunded to Funders**: `0.01 GEN` (`10000000000000000 wei` from canceled test escrow)
- **Treasury**: `0 GEN`

---

## 2. Completed Live Settlement Evidence

The following transactions have executed and finalized on GenLayer Studio Next.

### A. Contract Deployment
- **Tx Hash**: [`0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854`](https://explorer-studio-dev.genlayer.com/tx/0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854)
- **Status**: `FINALIZED`
- **Execution Result**: `FINISHED_WITH_RETURN`
- **Contract Produced**: `0x7Cef756668Cd925807e8B110D0330643c6F809E3`

### B. PyPI 404 Escrow Funding (Smoke)
- **Target**: `shiplock-smoke-does-not-exist` @ `0.0.0-smoke.1` (`PYPI_VERSION`)
- **Escrow ID**: `0x1ac2eea7c83967a0abe667355598d3809fb2552cc5d4227ad7ba86fee09a3c46`
- **Tx Hash**: [`0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312`](https://explorer-studio-dev.genlayer.com/tx/0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312)
- **Principal Locked**: `0.02 GEN`
- **On-Chain State**: `status=OPEN`, `match_reason=LOOKBACK_404_OK`
- **Window**: `2026-10-12T10:33:18Z` to `2026-10-14T10:33:18Z`

### C. npm 404 Escrow Funding (Smoke)
- **Target**: `shiplock-smoke-does-not-exist-npm` @ `0.0.0-smoke.1` (`NPM_VERSION`)
- **Escrow ID**: `0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e`
- **Tx Hash**: [`0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617`](https://explorer-studio-dev.genlayer.com/tx/0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617)
- **Principal Locked**: `0.02 GEN`
- **On-Chain State**: `status=OPEN`, `match_reason=LOOKBACK_404_OK`
- **Window**: `2026-10-12T10:33:18Z` to `2026-10-14T10:33:18Z`

### D. Funder Cancellation & Instant Native Refund
- **Target**: `shiplock-smoke-cancel-target` @ `0.0.0-smoke.1` (`PYPI_VERSION`)
- **Escrow ID**: `0xd450d74c0552b57579163e7ae988352b22f4722ceec43d0fca7a7e8da92ee6ff`
- **Cancel Tx Hash**: [`0xdb6d919c7b4462d479917e8df1783a6a087053c80e24bf5bce2600f0fc56ab4e`](https://explorer-studio-dev.genlayer.com/tx/0xdb6d919c7b4462d479917e8df1783a6a087053c80e24bf5bce2600f0fc56ab4e)
- **Status**: `FINALIZED`, `FINISHED_WITH_RETURN`
- **Post-State**: `status=CANCELED`
- **Refund Routing**: `0.01 GEN` immediately returned to funder wallet (`0x20E850BAaD26d763d4f691780D1BEBA01c8D6084`) via `emit_transfer` in the same consensus block.

---

## 3. Pending Time-Gated 404 Settlement Evidence

The contract strictly enforces that pre-window release calls revert (`contracts/shiplock.py:530-532`):
```python
if now_dt < start_dt:
    raise gl.vm.UserError("Execution window not open yet")
```

### Time Gates Schedule
```
Current Time:      2026-10-11 10:15:00 UTC
Window Start Gate: 2026-10-12 10:33:18 UTC  (In-Window Release Check)
Window End Gate:   2026-10-14 10:33:18 UTC  (Final No-Hit Settlement)
```

### Exact Settle Sequence
1. **At or after `2026-10-12 10:33:18 UTC` (In-Window Check)**:
   - Script: `node scripts/settle_404_escrows.mjs`
   - Caller: Non-funder account (`coverlock-submitter`).
   - Expected Result: Contract queries PyPI and npm. Both packages return 404 (package still not released). Because `now < window_end`, the escrow remains `OPEN` and the `0.02 GEN` principal remains fully locked.
2. **At or after `2026-10-14 10:33:18 UTC` (Post-Window Settlement)**:
   - Script: `node scripts/settle_404_escrows.mjs`
   - Caller: Non-funder account (`coverlock-submitter`).
   - Expected Result: Contract queries PyPI and npm. Both packages return 404. Because `now >= window_end`, the escrow transitions to `REFUND_NOHIT`. The full `0.02 GEN` principal routes back to funder credit or address. Economics updates: `refunded_to_funders += 0.04 GEN`.

The harness script `scripts/settle_404_escrows.mjs` is idempotent, reads live state before submitting, and will not double-submit or fail upon rerun.

---

## 4. Live Release Candidate Escrows & Registry Publication Protocol

To provide live successful-release evidence without relying on mocks, two real candidate test escrows have been funded and are active on Studio Next.

### A. Funded Release Candidate Escrows
| Registry | Package | Version | Escrow ID | Fund Tx | Window |
|---|---|---|---|---|---|
| **PyPI** | `shiplock-steward-release-live` | `1.0.0` | `0xdc2dfac88f9a7dbc2615c3a2338cd12819efca660352c1d1c8b6f530ed5f9c1a` | [`0x0f09d238...`](https://explorer-studio-dev.genlayer.com/tx/0x0f09d23831be1fb344b135c09cb674529e4caa5c607fe665988b5da80d342cc6) | `2026-10-12 12:11:12 UTC` – `2026-10-14 12:11:12 UTC` |
| **npm** | `shiplock-steward-release-live` | `1.0.0` | `0x3c46e617d6541f63e69f783c0a481f429bb9c7e08509274ebbef25fc1b8444ad` | [`0xb627438c...`](https://explorer-studio-dev.genlayer.com/tx/0xb627438c2bb6190960b9eea4c4acb8f09847e14aa02e0b4b219056437bd30a01) | `2026-10-12 12:11:12 UTC` – `2026-10-14 12:11:12 UTC` |

- **Principal**: `0.01 GEN` each (`10000000000000000 wei`)
- **Recipient Address**: `0x0f907a2598AEF71B988f9208103066586A1a4aF0`
- **Funder Address**: `0x20E850BAaD26d763d4f691780D1BEBA01c8D6084`
- **Initial Verification**: Both contracts passed on-chain `LOOKBACK_404_OK` consensus validation.

### B. Required Registry Publication Steps (Manual Steward Gate)
Because GenLayer queries real public registries (`pypi.org` and `registry.npmjs.org`), publishing artifacts requires authorized credentials. No credentials or tokens may be stored in Git.

1. **PyPI Artifact Publication**:
   - Time window: Between `2026-10-12 12:11:12 UTC` and `2026-10-14 12:11:12 UTC`.
   - Command:
     ```bash
     # From a local package directory containing pyproject.toml for shiplock-steward-release-live version 1.0.0
     python -m build
     twine upload --username __token__ --password <YOUR_PRIVATE_PYPI_API_TOKEN> dist/*
     ```
2. **npm Artifact Publication**:
   - Time window: Between `2026-10-12 12:11:12 UTC` and `2026-10-14 12:11:12 UTC`.
   - Command:
     ```bash
     # From a local package directory containing package.json for shiplock-steward-release-live version 1.0.0
     npm publish --access public
     ```
3. **Trigger On-Chain Release**:
   - Once published to the public registries, run:
     ```bash
     node scripts/release_candidate_escrows.mjs
     ```
   - This script invokes `release(cand.id)` from an authorized non-funder account (`coverlock-submitter`), verifies the consensus transition to `RELEASED`, confirms `0.01 GEN` recipient transfer to `0x0f907a25...`, and updates evidence logs.

---

## 5. Repository Cleanup Manifest

A comprehensive audit was performed across all tracked files. 29 obsolete, backup, redundant, or sensitive scratch files were removed.

| Removed File | Category | Reason for Removal |
|---|---|---|
| `convert_icons.py` | Obsolete Script | One-time asset converter; icons already converted and built into web assets. |
| `gltest.config.yaml.bak` | Backup File | Stale backup of test configuration. |
| `out1.txt` | Generated Log | Transient command output log. |
| `out2.txt` | Generated Log | Transient command output log. |
| `out3.txt` | Generated Log | Transient command output log. |
| `out4.txt` | Generated Log | Transient command output log. |
| `out_conftest.txt` | Generated Log | Transient command output log. |
| `rewrite2.py` | Scratch Script | Superseded code rewrite scratch file. |
| `rewrite_conftest.py` | Scratch Script | Superseded test rewrite scratch file. |
| `scratch_fee_profile.json` | Scratch File | Temporary fee calculation scratch file; production fees live in `fee-profile.json`. |
| `scripts/sync_keystore.mjs` | Superseded Script | Deprecated key sync helper superseded by `scripts/deployer_keystore.py`. |
| `setup_tests.py` | Scratch Script | One-time setup helper replaced by standard `pytest` suite. |
| `tests/fixtures/non_json.txt` | Duplicate Fixture | Exact duplicate of `tests/direct/fixtures/non_json.txt`. |
| `tests/fixtures/npm_published.json` | Duplicate Fixture | Exact duplicate of `tests/direct/fixtures/npm_published.json`. |
| `tests/fixtures/npm_scoped_published.json` | Duplicate Fixture | Exact duplicate of `tests/direct/fixtures/npm_scoped_published.json`. |
| `tests/fixtures/oversize_note.txt` | Duplicate Fixture | Exact duplicate of `tests/direct/fixtures/oversize_note.txt`. |
| `tests/fixtures/pypi_404.json` | Duplicate Fixture | Exact duplicate of `tests/direct/fixtures/pypi_404.json`. |
| `tests/fixtures/pypi_published.json` | Duplicate Fixture | Exact duplicate of `tests/direct/fixtures/pypi_published.json`. |
| `tests/fixtures/pypi_yanked.json` | Duplicate Fixture | Exact duplicate of `tests/direct/fixtures/pypi_yanked.json`. |
| `tests/integration/test_profile.py` | Stale Test | Abandoned mock integration test; replaced by direct unit suite and live Studio Next smoke tests. |
| `web/decrypt.mjs` | Superseded Script | Temporary keystore decryption probe. |
| `web/deploy.mjs` | Superseded Script | Outdated deployment script replaced by `scripts/deploy_shiplock_live.mjs`. |
| `web/deploy_pk.mjs` | Insecure Scratch | Contained hardcoded historical devnet test private key. |
| `web/deploy_pk2.mjs` | Insecure Scratch | Contained hardcoded historical devnet test private key. |
| `web/deploy_pk3.mjs` | Insecure Scratch | Contained hardcoded historical devnet test private key. |
| `web/deploy_pk4.mjs` | Insecure Scratch | Contained hardcoded historical devnet test private key. |
| `web/deploy_pk5.mjs` | Insecure Scratch | Contained hardcoded historical devnet test private key. |
| `web/deploy_pk6.mjs` | Insecure Scratch | Contained hardcoded historical devnet test private key. |
| `web/fix.js` | Scratch Script | Transient web fix scratch file. |
| `web/test-estimate.mjs` | Scratch Script | Ad-hoc fee estimation script replaced by verified fee profiles. |

---

## 6. Secret & Security Audit

An automated scan of the active repository tree was executed using `scripts/audit_secrets.py`:
- Scanned for: Private key regexes, `.env.local` files, decrypted keystores, raw hex seeds.
- Results: **0 leaked keys, 0 passwords, 0 decrypted credentials found in active tracked tree**.
- Keytar & encrypted keystores (`.deployer_keystore.json`) are strictly gitignored.

---

## 7. Verification Test Suite Results

### Direct Contract Tests
```bash
python -m pytest tests/direct -q
```
**Result**: **35 passed** in 3.61s.

### Keystore Manager Tests
```bash
python -m pytest tests/test_deployer_keystore.py -v
```
**Result**: **13 passed** in 1.45s.

### Frontend Quality Gates
```bash
npm --prefix web test
npm --prefix web run lint
npm --prefix web run build
```
**Result**:
- Web unit tests passed (12/12)
- ESLint passed (0 errors)
- Next.js production build succeeded (`.next` standalone artifact generated)
