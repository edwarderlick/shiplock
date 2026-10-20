# ShipLock Milestone Submission Package — Verified Release v2

**Status**: READY FOR MANUAL PORTAL SUBMISSION  
**Target Milestone**: ShipLock Verified Release v2 — Source-Linked Escrow Verification  
**Repository**: [https://github.com/edwarderlick/shiplock](https://github.com/edwarderlick/shiplock)  
**Milestone Implementation and Live-Evidence Commit SHA**: [`3495ebfcc4dc40be40444838657cc52f3a6c447a`](https://github.com/edwarderlick/shiplock/commit/3495ebfcc4dc40be40444838657cc52f3a6c447a)  
**Accepted Baseline Commit SHA**: [`0617a800a0cabde7d1e324df110bfd3c8b7ac138`](https://github.com/edwarderlick/shiplock/commit/0617a800a0cabde7d1e324df110bfd3c8b7ac138)  
**Live Application URL**: [https://shiplock-chi.vercel.app](https://shiplock-chi.vercel.app)  
**Network**: GenLayer Studio Next (`studio-dev`) | **Chain ID**: `61997`  
**Active Contract**: [`0xF2110c3E6B170caF10FE953564285C6f01cB1F0c`](https://explorer-studio-dev.genlayer.com/address/0xF2110c3E6B170caF10FE953564285C6f01cB1F0c)  

---

## A. Recommended Milestone Title
*(Character count: 64 / 80 maximum)*

```text
ShipLock Verified Release v2 — Source-Linked Escrow Verification
```

---

## B. Short Summary
*(Character count: 493 / 500 maximum)*

```text
ShipLock Verified Release v2 upgrades time-gated package escrows on GenLayer with dual-source validation. Instead of trusting registry metadata alone, GenLayer consensus validators independently query the official package registry and the canonical GitHub release API to verify matching tags, release timestamps, and repository linkage. The upgrade includes a deployed and byte-verified v2 contract, full Next.js production UI integration on Vercel, and two live funded escrows on Studio Next.
```

---

## C. Full Milestone Description
*(Character count: 2,345 / 2,500 maximum)*

```text
ShipLock Verified Release v2 delivers a substantial product and protocol upgrade over the accepted baseline (commit 0617a80). While v1 verified release escrows solely against a single package registry (npm or PyPI), v2 introduces dual-source verification enforced directly by GenLayer decentralized consensus validators.

Why this change is substantial:
Relying exclusively on registry metadata introduces vulnerability to registry credential leaks or detached package uploads where an artifact appears without corresponding open-source repository tags. In v2, GenLayer validators independently query both the official registry endpoint and canonical GitHub release API (api.github.com/repos/{owner}/{repo}/releases/tags/{tag}) using gl.eq_principle.strict_eq. Payouts require cross-source semantic alignment: in-window registry publication, unyanked status, canonical repository match, exact GitHub tag match, and in-window GitHub publication.

Architectural and code depth (not repackaging):
This upgrade adds over 10,000 lines of verified code, tests, and tooling across 35 files:
1. Intelligent Contract: contracts/shiplock.py implements fund_verified_escrow with SOURCE_LINKED policy, strict syntax validation rejecting URL injection and traversal, a canonical Git URL normalizer, 11-element deterministic preimage derivation, and extended audit storage.
2. Production Frontend: web/ integrates policy selection, live repo/tag validation, preimage review modals, and dual-source audit inspection on Vercel.
3. Test Suites: Expanded to 57 Python direct/keystore tests, 60 historical evidence harness tests, 59 live evidence harness safety tests, and 74 web frontend tests.
4. Tooling: Live evidence runner with fail-closed write guards, receipt normalization across SDK and native node receipt formats, and duplicate-write recovery.

Path to real-world usage and live proof:
Dual-source alignment bridges decentralized smart contracts with standard open-source release engineering, making escrows practical for real maintainers and funders. The upgrade is deployed live on Studio Next at 0xF2110c3E6B170caF10FE953564285C6f01cB1F0c with exact 51,327-byte source parity. As supporting proof of real on-chain operation, two live escrows (SUCCESS and MISMATCH cases) have been funded on-chain with 0.01 GEN each and stand verified in OPEN state.
```

---

## D. Verification and Evidence

### Core Public Links
- **GitHub Repository**: [https://github.com/edwarderlick/shiplock](https://github.com/edwarderlick/shiplock)
- **Milestone Implementation and Live-Evidence Commit**: [`3495ebfcc4dc40be40444838657cc52f3a6c447a`](https://github.com/edwarderlick/shiplock/commit/3495ebfcc4dc40be40444838657cc52f3a6c447a)
- **GitHub Compare (Baseline to v2)**: [https://github.com/edwarderlick/shiplock/compare/0617a80...3495ebf](https://github.com/edwarderlick/shiplock/compare/0617a80...3495ebf)
- **Production Web Application**: [https://shiplock-chi.vercel.app](https://shiplock-chi.vercel.app)
  - Verified routes: `/` (home), `/lock` (funding flow with policy selector), `/browse` (all escrows with policy badges), `/me` (connected user escrows)
- **Active v2 Contract on Studio Next**: [`0xF2110c3E6B170caF10FE953564285C6f01cB1F0c`](https://explorer-studio-dev.genlayer.com/address/0xF2110c3E6B170caF10FE953564285C6f01cB1F0c)
- **Contract Deployment Transaction**: [`0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f`](https://explorer-studio-dev.genlayer.com/transactions/0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f)
- **SUCCESS Funding Transaction**: [`0x86538668726638307a4897eb2fcb89ccd4d2ce642fc42abf10abab6ea8cf9726`](https://explorer-studio-dev.genlayer.com/transactions/0x86538668726638307a4897eb2fcb89ccd4d2ce642fc42abf10abab6ea8cf9726)
- **MISMATCH Funding Transaction**: [`0xa0acb2c81ef7e8aaae6d0f826f0ca6101904a337a1ef797d22855ade0d68ecf0`](https://explorer-studio-dev.genlayer.com/transactions/0xa0acb2c81ef7e8aaae6d0f826f0ca6101904a337a1ef797d22855ade0d68ecf0)
- **Milestone Submission Document**: [https://github.com/edwarderlick/shiplock/blob/main/MILESTONE_SUBMISSION.md](https://github.com/edwarderlick/shiplock/blob/main/MILESTONE_SUBMISSION.md)
- **Milestone Current State Snapshot (JSON)**: [https://github.com/edwarderlick/shiplock/blob/main/evidence/submission/milestone_current_state.json](https://github.com/edwarderlick/shiplock/blob/main/evidence/submission/milestone_current_state.json)

### Live Funded Evidence Escrows (On-Chain Proof)
1. **SUCCESS Escrow (In-Window Source-Linked Target)**:
   - **Escrow ID**: `0x5c751544da2e5d505dbdb118ca2fb94e53091bb28493c236889ae69fc78a909d`
   - **Funding Transaction**: [`0x86538668726638307a4897eb2fcb89ccd4d2ce642fc42abf10abab6ea8cf9726`](https://explorer-studio-dev.genlayer.com/transactions/0x86538668726638307a4897eb2fcb89ccd4d2ce642fc42abf10abab6ea8cf9726)
   - **Status**: `OPEN` (`match_reason: "LOOKBACK_404_OK"`)
   - **Principal**: `10000000000000000` wei (`0.01 GEN`)
   - **Policy**: `SOURCE_LINKED`
   - **Target Coordinates**: `shiplock-v2-evidence-f2110c3e@1.0.0` / `edwarderlick/shiplock` tag `shiplock-evidence-v2-success-f2110c3e`
2. **MISMATCH Escrow (Post-Window Negative Target)**:
   - **Escrow ID**: `0xdb592d59e4dbc85926eac234ba3c92677ec2f42aeb4de1f1430cf9454d7a5a88`
   - **Funding Transaction**: [`0xa0acb2c81ef7e8aaae6d0f826f0ca6101904a337a1ef797d22855ade0d68ecf0`](https://explorer-studio-dev.genlayer.com/transactions/0xa0acb2c81ef7e8aaae6d0f826f0ca6101904a337a1ef797d22855ade0d68ecf0)
   - **Status**: `OPEN` (`match_reason: "LOOKBACK_404_OK"`)
   - **Principal**: `10000000000000000` wei (`0.01 GEN`)
   - **Policy**: `SOURCE_LINKED`
   - **Target Coordinates**: `shiplock-v2-no-release-f2110c3e@1.0.0` / `edwarderlick/shiplock` tag `shiplock-evidence-v2-missing-f2110c3e`
3. **Current Contract Economics**:
   - `escrowed_open = 20000000000000000` wei (`0.02 GEN`), `paid_to_recipients = 0`, `refunded_to_funders = 0`

### Repository Evidence & Documentation Files
- **Comprehensive Milestone Report**: [`MILESTONE_01.md`](https://github.com/edwarderlick/shiplock/blob/3495ebfcc4dc40be40444838657cc52f3a6c447a/MILESTONE_01.md)
- **Live Steward Evidence Report**: [`EVIDENCE.md`](https://github.com/edwarderlick/shiplock/blob/3495ebfcc4dc40be40444838657cc52f3a6c447a/EVIDENCE.md)
- **Phase C Operator Runbook**: [`PHASE_C_RUNBOOK.md`](https://github.com/edwarderlick/shiplock/blob/3495ebfcc4dc40be40444838657cc52f3a6c447a/PHASE_C_RUNBOOK.md)
- **Verified Steward Evidence State (JSON)**: [`scripts/v2_steward_evidence.json`](https://github.com/edwarderlick/shiplock/blob/3495ebfcc4dc40be40444838657cc52f3a6c447a/scripts/v2_steward_evidence.json)

### Source Parity & Test Suite Results
- **Source Byte Parity**: Exact UTF-8 byte match (51,327 bytes, SHA-256: `860387dc9579aba8d445df9395c4ec80bc425b7b8a3d7b27eed8cc477b59276d`)
- **Direct Python Contract & Keystore Tests**: `57 passed` in 11.11s across 2 suites (`python -m pytest`)
- **Historical Evidence Harness & Attack Simulation**: `60 passed` across 11 suites (`node --test tests/test_evidence_harness.mjs`)
- **v2 Live Evidence Harness Safety Suite**: `59 passed` across 1 suite (`node --test tests/test_v2_live_evidence.mjs`)
- **Web Frontend Integration Tests**: `74 passed` across 16 suites (`npm --prefix web test`)
- **Web Linter**: `0 errors, 18 warnings` (`npm --prefix web run lint`)
- **TypeScript Gate**: `0 errors` (`npx --prefix web tsc -p web/tsconfig.json --noEmit`)
- **Production Build**: Successfully compiled 11 static routes via Next.js Turbopack (`npm --prefix web run build`)
- **Git Format & Whitespace Check**: Clean (`git diff --check`)

---

## E. Current-State Truthful Disclosure

1. **Both Escrows are Live, Funded, and Currently OPEN**:
   Both the SUCCESS escrow (`0x5c751544...`) and MISMATCH escrow (`0xdb592d59...`) were genuinely funded on GenLayer Studio Next with 0.01 GEN each. Both currently reside on-chain in `OPEN` state with match reason `LOOKBACK_404_OK`.
2. **Settlement is Strictly Pending the Common Publication Window**:
   The common publication window opens at `2026-10-21T11:20:26Z` (October 21, 2026, 4:50:26 PM IST) and closes at `2026-10-23T06:58:31Z`. Release settlement has not yet occurred.
3. **Zero Premature Settlement Claims**:
   No completed payout, refund, or settlement is claimed in this submission. The pending lifecycle transitions will occur in future operator phases and are an additional future follow-up, not a prerequisite for evaluating the completed and deployed v2 milestone.
4. **Controlled Coordinate Invariant**:
   Both npm packages and the GitHub release tag currently return HTTP 404 (strictly absent). The MISMATCH release tag `shiplock-evidence-v2-missing-f2110c3e` will never be created, ensuring the controlled negative refund invariant holds when settlement is executed.

---

## F. Quality-Bar Mapping

| Requirement | How ShipLock Verified Release v2 Satisfies the Standard |
|---|---|
| **Substantial Improvement** | Eliminates single-registry failure modes by introducing dual-source consensus validation directly on GenLayer validators using `gl.eq_principle.strict_eq`. Validates package metadata, canonical repository URLs, and GitHub release tags in parallel. |
| **Not Repackaging / Cosmetic** | Adds over 10,000 net new lines across 35 files. Introduces new intelligent contract writes (`fund_verified_escrow`), 11-element preimage derivation, injection-safe validators, new frontend page flows on Vercel, dedicated live evidence harnesses, and comprehensive test suites. |
| **Builds on Accepted Baseline** | Inherits and preserves 100% backward compatibility with the accepted baseline (`0617a80`), while adding the `SOURCE_LINKED` policy as an opt-in verified path. |
| **Documented Delta** | Every contract, frontend, and tooling change is documented in `MILESTONE_01.md`, `EVIDENCE.md`, and traceable in Git commit history via compare `0617a80...3495ebf`. |
| **Moves Toward Real Usage** | Solves an acute real-world software supply chain problem: ensuring open-source maintainers publish matching repository release tags alongside package registry updates before funds are released. |

---

## G. Manual Submission Checklist

Use this checklist when manually entering the submission into the GenLayer Milestones portal:

- [ ] **Milestone Title**: Copy exact text from Section A:
  `ShipLock Verified Release v2 — Source-Linked Escrow Verification`
- [ ] **Short Summary**: Copy exact text from Section B (493 characters).
- [ ] **Milestone Description**: Copy exact text from Section C (2,345 characters).
- [ ] **Repository Link**: Paste `https://github.com/edwarderlick/shiplock`
- [ ] **Commit SHA**: Paste `3495ebfcc4dc40be40444838657cc52f3a6c447a` (Milestone implementation and live-evidence commit)
- [ ] **Contract Address**: Paste `0xF2110c3E6B170caF10FE953564285C6f01cB1F0c`
- [ ] **Deployment Tx**: Paste `0x6874241737bf6b45f0e5f71211a5923bb02e6c8b715b15ed606a405d4a28182f`
- [ ] **Production Web URL**: Paste `https://shiplock-chi.vercel.app`
- [ ] **Evidence URLs**: Copy bullet points from Section D.
- [ ] **Disclosure Confirmation**: Verify Section E disclosure is present so stewards understand both escrows are currently OPEN pending the scheduled publication window.
- [ ] **Review Before Final Click**: Confirm no private keys, passwords, or local `.env` details are included.
