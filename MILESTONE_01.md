# Milestone 01: ShipLock Verified Release v2 — Source-Linked Multi-Source Release Verification

## 1. Milestone Overview

- **Milestone Title**: ShipLock Verified Release v2 — Source-Linked Multi-Source Release Verification
- **Accepted Baseline HEAD SHA**: `0617a800a0cabde7d1e324df110bfd3c8b7ac138`
- **Verification Policy**: `SOURCE_LINKED` ("Source-Linked Verified Release") vs `REGISTRY_ONLY` ("Registry Release")
- **Implementation Status**: Complete in working tree; verified via automated contract, evidence harness, and frontend suites.

---

## 2. Why This Change Is Substantial

The baseline version of ShipLock verified time-gated release escrows solely against a single public package registry (either PyPI or npm). While effective for basic publication gating, relying exclusively on registry metadata introduces vulnerability to registry-side account compromises or unlinked package uploads where an artifact is published without corresponding open-source repository release tags.

**ShipLock Verified Release v2** introduces multi-source release verification enforced directly by GenLayer decentralized consensus validators:
1. **Dual Independent Evidence Sourcing**: During settlement, validators independently retrieve authoritative metadata from both the package registry (npm or PyPI) AND the project's canonical GitHub repository release API (`https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}`).
2. **Cross-Source Semantic Alignment**: Validators verify that:
   - The package version was published on the registry within the escrow's UTC window `[start_utc, end_utc]`.
   - The package version is not yanked.
   - The registry record's repository metadata matches the escrow's immutable expected GitHub repository.
   - The GitHub release tag exists, is not a draft, and exact tag name matches `expected_tag`.
   - The GitHub release publication timestamp falls within `[start_utc, end_utc]`.
3. **Honest Terminology & Qualification**: This policy is strictly designated as **Source-Linked Verified Release**. Matching registry metadata and GitHub release evidence establishes verifiable *source linkage*; it does not prove cryptographic build provenance (which would require verifying a signed cryptographic attestation such as SLSA provenance or Sigstore signatures).
4. **Strict Backward Compatibility**: The existing `fund_escrow` write path and registry-only settlement behavior remain 100% operational for existing users and automated workflows.

---

## 3. Before & After Architecture

### Before (ShipLock v1)
```mermaid
flowchart LR
    Funder -->|fund_escrow| Contract[ShipLock Contract]
    Contract -->|Lookback 404| Registry[(npm / PyPI)]
    Anyone -->|release| GenLayerVM[GenLayer Validators]
    GenLayerVM -->|Single fetch: strict_eq| Registry
    GenLayerVM -->|Settle| Contract
    Contract -->|Payout / Refund| Recipient[Recipient / Funder]
```

### After (ShipLock v2)
```mermaid
flowchart TD
    subgraph Funding [Escrow Initiation]
        F1[Funder: fund_escrow] -->|Policy: REGISTRY_ONLY| SC[ShipLock Contract]
        F2[Funder: fund_verified_escrow] -->|Policy: SOURCE_LINKED<br/>+ expected_repo & tag| SC
    end

    subgraph Consensus [GenLayer Decentralized Consensus Validators]
        direction TB
        Val[Validator Quorum: gl.eq_principle.strict_eq]
        Val -->|Fetch 1: HTTPS| Reg[(Official Registry<br/>npm / PyPI)]
        Val -->|Fetch 2: HTTPS| GH[(GitHub API<br/>repos/:owner/:repo/releases/tags/:tag)]
        Reg --> NormReg[Extract Stable Fields:<br/>status, pub_time, yanked, repository]
        GH --> NormGH[Extract Stable Fields:<br/>status, tag_name, published_at, repo]
        NormReg --> CrossCheck{Dual Source<br/>Alignment Check}
        NormGH --> CrossCheck
    end

    subgraph Settlement [On-Chain Execution & Accounting]
        SC -->|Trigger release| Val
        CrossCheck -->|All 7 Conditions Pass| Rel[RELEASED -> Pay Recipient]
        CrossCheck -->|In-Window Mismatch / 404 / Transport Fail| Open[OPEN -> Retryable, 0 Transfers]
        CrossCheck -->|Post-Window Conclusive Absence / Mismatch| Ref[REFUND_NOHIT -> Refund Funder]
        CrossCheck -->|Post-Window Transport / Feed Failure| OpenPost[OPEN -> Fail-Closed, Retryable]
    end
```

---

## 4. Contract & Public API Changes

### 1. New Public Write: `fund_verified_escrow`
```python
@gl.public.write
def fund_verified_escrow(
    self,
    template: str,
    package: str,
    version: str,
    expected_repo: str,
    expected_tag: str,
    recipient: str,
    window_start: str,
    window_end: str,
    nonce: int = 0
) -> str:
```
- **Preimage & Deterministic ID**: Derived via SHA-256 over an 11-element preimage:
  `{funder_hex}|{payee_hex}|{template}|{package}|{version}|{canon_repo}|{canon_tag}|{window_start}|{window_end}|{amount}|{nonce}`
- **Preserved Existing Write**: `fund_escrow(template, package, version, recipient, window_start, window_end, nonce)` is behaviorally preserved, populating legacy default coordinates with `policy = POLICY_REGISTRY_ONLY`, empty expected repo/tag, and maintaining 100% backward compatibility.

### 2. Strict Input Validation on GitHub Repo & Tag
- **`expected_repo` validation**:
  - Requires canonical `owner/repo` syntax (exactly one forward slash).
  - Rejects traversal (`..`), URL schemes (`https://`), query strings (`?`), fragments (`#`), control characters, and whitespace.
  - Bounds length strictly `[3, 128]` characters.
- **`expected_tag` validation**:
  - Rejects path separators (`/`), path traversal (`..`), spaces, control characters, and dangerous git ref characters (`~`, `^`, `:`, `?`, `*`, `[`, `\`, `@{`).
  - Bounds length strictly `[1, 128]` characters.

### 3. Extended Escrow Storage & Audit View (`get_escrow`)
Each escrow stores and returns immutable audit fields:
- `policy`: `"SOURCE_LINKED"` or `"REGISTRY_ONLY"`
- `expected_repo`: Canonical GitHub owner/repo (e.g. `"shiplock-org/shiplock-core"`)
- `expected_tag`: Canonical Git release tag (e.g. `"v1.0.0"`)
- `registry_evidence`: JSON-encoded normalized registry verification record
- `github_evidence`: JSON-encoded normalized GitHub release verification record
- `match_reason`: Precise reason code describing the settlement decision

### 4. Canonical Git URL Normalizer (`_normalize_github_repo_url`)
Handles and canonicalizes diverse repository metadata representations found across npm `package.json` and PyPI `project_urls`:
- `https://github.com/owner/repo.git` → `owner/repo`
- `git+https://github.com/owner/repo` → `owner/repo`
- `git@github.com:owner/repo.git` → `owner/repo`
- `ssh://git@github.com/owner/repo.git` → `owner/repo`
- `github:owner/repo` → `owner/repo`
- `owner/repo` → `owner/repo`

---

## 5. Consensus & Fail-Closed Design

All network access is executed within GenLayer's non-deterministic equivalence principle:
```python
def run():
    reg_meta = _fetch_and_parse_registry(e.template, e.package_name, e.version)
    gh_owner, gh_repo = e.expected_repo.split("/", 1)
    gh_meta = fetch_github_release(gh_owner, gh_repo, e.expected_tag)
    return json.dumps({
        "registry": reg_meta,
        "github": gh_meta
    }, sort_keys=True)

all_ev_str = gl.eq_principle.strict_eq(run)
```

### Precise Reason Codes
| Settlement Condition | Timing | State | Reason Code | Outcome |
|---|---|---|---|---|
| All 7 conditions verified | Inside window or post-window | `RELEASED` | `VERIFIED_RELEASE` | Pays recipient `amount` |
| GitHub release not found (404) | Active window (`now < end`) | `OPEN` | `EARLY_GITHUB_404_RETRYABLE` | Retryable; 0 transfer |
| Registry repo mismatch | Active window (`now < end`) | `OPEN` | `EARLY_REGISTRY_MISMATCH_RETRYABLE` | Retryable; 0 transfer |
| GitHub tag mismatch | Active window (`now < end`) | `OPEN` | `EARLY_GITHUB_TAG_MISMATCH_RETRYABLE` | Retryable; 0 transfer |
| GitHub transport error (403/429/5xx) | Active window (`now < end`) | `OPEN` | `EARLY_GITHUB_UNAVAILABLE_RETRYABLE` | Retryable; 0 transfer |
| Registry transport error | Active window (`now < end`) | `OPEN` | `EARLY_REGISTRY_UNAVAILABLE_RETRYABLE` | Retryable; 0 transfer |
| Conclusive GitHub 404 | After window (`now >= end`) | `REFUND_NOHIT` | `WINDOW_EXPIRED_GITHUB_NO_RELEASE` | Refunds funder `amount` |
| Conclusive repo mismatch | After window (`now >= end`) | `REFUND_NOHIT` | `REGISTRY_REPO_MISMATCH` | Refunds funder `amount` |
| Conclusive tag mismatch | After window (`now >= end`) | `REFUND_NOHIT` | `GITHUB_TAG_MISMATCH` | Refunds funder `amount` |
| Transport failure / inconclusive | After window (`now >= end`) | `OPEN` | `POST_WINDOW_GITHUB_UNAVAILABLE` | Fail-closed; retryable |

---

## 6. Threat Model & Security Invariants

1. **Fail-Closed on Evidence Incompleteness**: Transport timeouts, rate limits (HTTP 429), server errors (5xx), redirects, oversized bodies (>256 KiB), and non-JSON responses NEVER cause settlement. The escrow remains `OPEN`.
2. **Protection Against Hostile URL Injection**: Validators never accept user-provided URLs. Target URLs are constructed internally using sanitized canonical components (`https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}`).
3. **No Double Settlement / Replay**: Once an escrow transitions to `RELEASED`, `REFUND_NOHIT`, `CANCELED`, or `EXPIRED`, all further calls to `release` or `expire` revert immediately (`"not OPEN"`).
4. **Funder Self-Release Prevention**: Calls to `release` from the funder address revert with `UserError("Funder cannot release")`.
5. **Exact Economics & Fee Bounds**: Escrow accounting strictly balances `escrowed_open + paid_to_recipients + refunded_to_funders == total_funded`.
6. **Two-Recipient Allocation Tree**: Release writes maintain a two-root allocation tree covering both `recipient` and `funder` to prevent Mode 1 out-of-gas failures during cross-boundary state transitions.

---

## 7. Verification Test Results

All verification suites executed locally against the implementation:

```bash
# 1. Direct Python Contract & Keystore Tests:
python -m pytest
# Result: 56 passed in 11.10s (43 contract direct tests + 13 deployer keystore tests)

# 2. Node Evidence Harness & Adversarial Simulation:
node --test tests/test_evidence_harness.mjs
# Result: 60 passed (11 suites, 0 failed, 0 skipped)

# 3. Next.js Web Integration & Runtime Tests:
npm --prefix web test
# Result: 74 passed (16 suites, 0 failed, 0 skipped)

# 4. Web Linter:
npm --prefix web run lint
# Result: 0 errors (18 pre-existing warnings)

# 5. Production Web Build:
npm --prefix web run build
# Result: Compiled successfully via Next.js 16.3.6 Turbopack
```

---

## 8. Files Touched

| File | Role |
|---|---|
| `contracts/shiplock.py` | Implements `SOURCE_LINKED` policy, `fund_verified_escrow`, canonical repo/tag validation, dual-source consensus settlement, and audit views. |
| `fee-profile.json` | Configures `fund_verified_escrow` with 200 leader / 400 validator timeunits within Studio Next `[30, 600]` bounds. |
| `scripts/evidence_helper.mjs` | Implements off-chain verification helpers for repo/tag validation, URL normalization, and GitHub release parsing. |
| `tests/direct/conftest.py` | Configures test runner with GenVM `v0.6.0-rc8` parity. |
| `tests/direct/utils.py` | Enhances mock registry with multi-pattern dictionary routing for dual-source consensus simulation. |
| `tests/direct/test_shiplock.py` | Adds 8 comprehensive direct contract test suites covering input rejections, deterministic IDs, verified release, active-window retryability, and post-window conclusive refunds. |
| `tests/test_evidence_harness.mjs` | Adds Suite 10 covering adversarial repo/tag attacks, URL normalization, and dual-source consensus simulation. |
| `web/src/fee-profile.json` | Synchronizes frontend fee profile with 200/400 allocations for `fund_verified_escrow`. |
| `web/src/lib/escrow.ts` | Implements client-side repo/tag validation and 11-element preimage derivation for `SOURCE_LINKED` escrows. |
| `web/src/lib/write.ts` | Updates `verifyCreatedEscrow` to validate `policy`, `expectedRepo`, and `expectedTag` on-chain. |
| `web/src/app/lock/page.tsx` | Adds policy selector ("Source-Linked Verified Release" vs "Registry Release"), GitHub inputs, live client-side validation, and review modal. |
| `web/src/app/escrow/[id]/page.tsx` | Adds policy badge, GitHub repo/tag links, dual-source evidence inspection cards, and clear retryable reason notices. |
| `web/src/app/browse/page.tsx` | Displays policy badge and repository target on escrow list cards. |
| `web/src/app/me/page.tsx` | Displays policy badge and repository target on user's personal lock cards. |
| `web/test/flow.test.ts` | Adds Section 8 testing client-side validation, 11-element preimage derivation, fee profile allocations, and `verifyCreatedEscrow`. |
| `README.md` | Documents the Source-Linked Verified Release policy, API signatures, and updated test counts. |
| `TESTCASES.md` | Documents verified escrow test cases and procedures. |
| `EVIDENCE.md` | Appends Milestone v2 section with pending live deployment steps while preserving all historical evidence. |
| `MILESTONE_01.md` | Comprehensive milestone report and specification. |

---

## 9. Honest Limitations

1. **Not Cryptographic Build Provenance**: Verification matches package registry metadata with GitHub release tags and publication timestamps. It establishes that an official release tag and package publish occurred in the same authorized window for matching repositories. It does not inspect cryptographic build provenance or signed commit attestations (e.g., Sigstore/in-toto SLSA attestations).
2. **GitHub API Rate Limits**: GitHub's unauthenticated public API is subject to rate limiting (60 requests/hr per IP). Validators encountering HTTP 403/429 fail closed and leave the escrow `OPEN` until rate limits reset.
3. **Draft Releases Excluded**: GitHub releases flagged as `"draft": true` are treated as unpublished and will not trigger settlement.

---

## 10. Live Verification Status (Placeholders)

The following live operational steps require human execution on the live network and are clearly marked **PENDING**:

- **Final Commit SHA**: `[PENDING: orchestrator commit]`
- **GitHub Compare URL**: `[PENDING: https://github.com/edwarderlick/shiplock/compare/0617a80...<final-sha>]`
- **New Contract Address**: `[PENDING: deploy contracts/shiplock.py to Studio Next]`
- **Deployment Transaction Hash**: `[PENDING: deployment tx hash]`
- **Successful Release Transaction Hash**: `[PENDING: in-window verified release tx hash]`
- **Child Transfer Transaction Hash**: `[PENDING: emitted child transfer tx hash]`
- **Negative / Mismatch Proof Hash**: `[PENDING: negative mismatch settlement tx hash]`
- **Live Application Deployment**: `[PENDING: Vercel deployment of milestone v2]`
