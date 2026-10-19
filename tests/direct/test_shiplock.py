import hashlib
import json
import pytest
from utils import mock_registry, load_fix, empty_registry

WEI = 10**18
PKG = "shiplock-test"
VER = "1.0.0"
PYPI = "PYPI_VERSION"
NPM = "NPM_VERSION"

@pytest.fixture
def emit_spy():
    class Spy:
        def __init__(self):
            self.emits = []
        def clear(self):
            self.emits.clear()
    return Spy()

def patch_recipient(direct_vm, contract, emit_spy):
    import sys
    for mod_name, mod in list(sys.modules.items()):
        if getattr(mod, 'ShipLock', None) == contract.__class__:
            class DummyRecipient:
                def __init__(self, addr):
                    self.addr = addr
                def emit_transfer(self, value):
                    emit_spy.emits.append((self.addr, value))
            mod._Recipient = DummyRecipient
            return

    orig_pay = contract._pay
    def mock_pay(addr, amount):
        if amount > 0:
            emit_spy.emits.append((addr, amount))
        orig_pay(addr, amount)
    contract._pay = mock_pay

@pytest.fixture
def base_contract(direct_vm, direct_deploy, direct_alice, emit_spy):
    empty_registry(direct_vm)
    import sys
    for k in list(sys.modules.keys()):
        if k == "genlayer" or k.startswith("genlayer."):
            del sys.modules[k]
    contract = direct_deploy("contracts/shiplock.py")
    direct_vm.sender = direct_alice
    direct_vm.deal(direct_alice, 1000 * WEI)
    patch_recipient(direct_vm, contract, emit_spy)
    return contract

def fund(contract, direct_vm, recipient, window_start, window_end, amount, template=PYPI, pkg=PKG, ver=VER, nonce=0):
    direct_vm.value = amount
    id_hash = contract.fund_escrow(template, pkg, ver, recipient, window_start, window_end, nonce)
    direct_vm.value = 0
    return id_hash

def addr_hex(addr) -> str:
    if hasattr(addr, "as_hex"):
        return addr.as_hex.lower()
    from genlayer.types import Address
    return Address(addr).as_hex.lower()


# ---------------------------------------------------------------------------
# 1. Deterministic IDs tests
# ---------------------------------------------------------------------------

def test_deterministic_ids_reproducible_across_runs_and_distinct_nonces(base_contract, direct_vm, direct_alice, direct_bob):
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    direct_vm.warp("2026-01-01T12:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-05T00:00:00Z"
    amount = 10 * WEI

    funder_hex = addr_hex(direct_alice)
    payee_hex = addr_hex(direct_bob)
    nonce = 42
    preimage = f"{funder_hex}|{payee_hex}|{PYPI}|{PKG}|{VER}|{start}|{end}|{amount}|{nonce}".encode("utf-8")
    expected_id = "0x" + hashlib.sha256(preimage).hexdigest()

    actual_id = fund(base_contract, direct_vm, direct_bob, start, end, amount, nonce=nonce)
    assert actual_id == expected_id
    assert actual_id.startswith("0x")
    assert len(actual_id) == 66

    recalc_id = "0x" + hashlib.sha256(preimage).hexdigest()
    assert recalc_id == actual_id

    id_nonce_0 = fund(base_contract, direct_vm, direct_bob, start, end, amount, nonce=0)
    id_nonce_1 = fund(base_contract, direct_vm, direct_bob, start, end, amount, nonce=1)
    assert id_nonce_0 != id_nonce_1
    assert id_nonce_0 != actual_id


def test_five_concurrent_fund_distinct_hash_ids(base_contract, direct_vm, direct_bob):
    ids = set()
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-05T00:00:00Z"
    for i in range(5):
        direct_vm.warp(f"2026-01-01T12:00:0{i}Z")
        ids.add(fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=i))
    assert len(ids) == 5
    for id in ids:
        assert str(id).startswith("0x")
        assert len(str(id)) == 66


# ---------------------------------------------------------------------------
# 2. Early retry: 404 -> OPEN with no transfer -> later PyPI success
# ---------------------------------------------------------------------------

def test_early_404_remains_open_no_transfer_then_later_pypi_success(base_contract, direct_vm, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount)

    # 1. Early check during window before window_end (2026-03-04)
    direct_vm.warp("2026-03-04T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()

    # PyPI returns 404 (not published yet)
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    base_contract.release(id_hash)

    # Must remain OPEN, retain funds, and emit NO transfer
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_404_RETRYABLE"
    assert addr_hex(escrow["releaser"]) == "0x0000000000000000000000000000000000000000"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0

    # 2. Later caller retries at 2026-03-06 after package is published
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_published.json"), status=200)
    emit_spy.clear()

    base_contract.release(id_hash)

    # Now settles as RELEASED with payout to recipient
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "RELEASED"
    assert escrow["match_reason"] == "200_IN_WINDOW"
    assert addr_hex(escrow["releaser"]) == addr_hex(direct_bob)
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_bob)
    assert emit_spy.emits[0][1] == amount

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["paid_to_recipients"] == amount
    assert eco["refunded_to_funders"] == 0


# ---------------------------------------------------------------------------
# 3. HTTP Status handling: 429, 403, 301, 5xx leave escrow OPEN before & after window
# ---------------------------------------------------------------------------

def test_unexpected_http_statuses_leave_open_before_and_after_window(base_contract, direct_vm, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount)

    direct_vm.sender = direct_bob

    # 1. Before window_end (2026-03-04): 429 Too Many Requests -> remains OPEN, no transfer
    direct_vm.warp("2026-03-04T00:00:00Z")
    emit_spy.clear()
    mock_registry(direct_vm, "Too Many Requests", status=429)
    base_contract.release(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "OPEN"
    assert len(emit_spy.emits) == 0

    # 403 Forbidden -> remains OPEN
    mock_registry(direct_vm, "Forbidden", status=403)
    base_contract.release(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "OPEN"
    assert len(emit_spy.emits) == 0

    # 301 Moved Permanently redirect -> remains OPEN
    mock_registry(direct_vm, "Moved", status=301)
    base_contract.release(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "OPEN"
    assert len(emit_spy.emits) == 0

    # 2. After window_end (2026-03-12): unexpected statuses must NOT trigger REFUND_NOHIT
    direct_vm.warp("2026-03-12T00:00:00Z")

    # 429 after window -> remains OPEN
    mock_registry(direct_vm, "Rate limit", status=429)
    base_contract.release(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "OPEN"
    assert len(emit_spy.emits) == 0

    # 403 after window -> remains OPEN
    mock_registry(direct_vm, "Forbidden", status=403)
    base_contract.release(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "OPEN"
    assert len(emit_spy.emits) == 0

    # 302 redirect after window -> remains OPEN
    mock_registry(direct_vm, "Found", status=302)
    base_contract.release(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "OPEN"
    assert len(emit_spy.emits) == 0

    # 500 error after window -> remains OPEN
    mock_registry(direct_vm, "Internal Server Error", status=500)
    base_contract.release(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "OPEN"
    assert len(emit_spy.emits) == 0

    # Funds remain intact and releaser unchanged throughout all inconclusive checks
    assert base_contract.get_economics()["escrowed_open"] == amount
    assert addr_hex(base_contract.get_escrow(id_hash)["releaser"]) == "0x0000000000000000000000000000000000000000"


# ---------------------------------------------------------------------------
# 4. fund_escrow gate: permit only verified 404 or exact-version absence
# ---------------------------------------------------------------------------

def test_fund_escrow_permit_only_verified_absent(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"

    # 1. Verified 404 on PyPI -> permitted
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id1 = fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=1)
    assert id1.startswith("0x")

    # 2. Verified exact-version absence on npm (package exists, but target version absent) -> permitted
    npm_pkg_without_ver = json.dumps({
        "name": "my-npm-pkg",
        "versions": {"0.9.0": {"name": "my-npm-pkg", "version": "0.9.0"}},
        "time": {"0.9.0": "2025-01-01T00:00:00Z"}
    })
    mock_registry(direct_vm, npm_pkg_without_ver, status=200)
    id2 = fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, template=NPM, pkg="my-npm-pkg", ver="1.0.0", nonce=2)
    assert id2.startswith("0x")

    # 3. 200 with matching published version -> rejected as already published
    mock_registry(direct_vm, load_fix("pypi_published.json"), status=200)
    with pytest.raises(Exception, match="already published"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=3)

    # 4. 200 with metadata mismatch (wrong package name) -> rejected
    mismatched_pypi = json.dumps({
        "info": {"name": "totally-different-pkg", "version": VER},
        "urls": [{"upload_time_iso_8601": "2026-03-02T12:00:00Z", "yanked": False}]
    })
    mock_registry(direct_vm, mismatched_pypi, status=200)
    with pytest.raises(Exception, match="lookback metadata mismatch"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=4)

    # 5. Malformed 200 (non-json) -> rejected
    mock_registry(direct_vm, "not a json document", status=200)
    with pytest.raises(Exception, match="lookback response malformed"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=5)

    # 6. HTTP 429 Too Many Requests -> rejected as unavailable
    mock_registry(direct_vm, "Rate limit exceeded", status=429)
    with pytest.raises(Exception, match="lookback evidence unavailable"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=6)

    # 7. HTTP 403 Forbidden -> rejected as unavailable
    mock_registry(direct_vm, "Access Denied", status=403)
    with pytest.raises(Exception, match="lookback evidence unavailable"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=7)

    # 8. HTTP 301 Redirect -> rejected as unavailable
    mock_registry(direct_vm, "Redirecting", status=301)
    with pytest.raises(Exception, match="lookback evidence unavailable"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=8)

    # 9. HTTP 500 Error -> rejected as unavailable
    mock_registry(direct_vm, "Server error", status=500)
    with pytest.raises(Exception, match="lookback evidence unavailable"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=9)


# ---------------------------------------------------------------------------
# 5. npm semantics: deprecated version is published, NOT yanked
# ---------------------------------------------------------------------------

def test_npm_deprecated_version_is_released_not_yanked(base_contract, direct_vm, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 25 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    pkg = "deprecated-demo"
    ver = "1.0.0"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=pkg, ver=ver)

    # npm response has "deprecated" advisory message on the published version
    npm_deprecated_resp = json.dumps({
        "name": pkg,
        "versions": {
            ver: {
                "name": pkg,
                "version": ver,
                "deprecated": "This package version is deprecated! Please use v2.0.0+"
            }
        },
        "time": {
            "created": "2026-03-01T00:00:00.000Z",
            ver: "2026-03-04T12:00:00.000Z"
        }
    })

    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, npm_deprecated_resp, status=200)

    base_contract.release(id_hash)

    # According to documented npm semantics, deprecated packages remain published & installable.
    # Therefore, release succeeds and pays recipient!
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "RELEASED"
    assert escrow["yanked"] is False
    assert escrow["publish_time"] == "2026-03-04T12:00:00.000Z"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_bob)
    assert emit_spy.emits[0][1] == amount


# ---------------------------------------------------------------------------
# 6. Realistic large npm package response assessment (256 KB safety cap)
# ---------------------------------------------------------------------------

def test_realistic_large_npm_response_and_oversize_cap(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 30 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    pkg = "large-ecosystem-pkg"
    ver = "2.150.0"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=pkg, ver=ver)

    # Build a realistic 70+ KB package response representing an active package with 200 releases
    versions = {}
    time_map = {"created": "2020-01-01T00:00:00Z", "modified": "2026-03-02T14:30:00Z"}
    for i in range(200):
        v = f"2.{i}.0"
        versions[v] = {
            "name": pkg,
            "version": v,
            "description": f"Release {v} with full metadata, dependencies and distribution hashes",
            "dependencies": {"lodash": "^4.17.21", "express": "^4.18.2"},
            "dist": {
                "tarball": f"https://registry.npmjs.org/{pkg}/-/{pkg}-{v}.tgz",
                "shasum": "0123456789abcdef0123456789abcdef01234567"
            }
        }
        time_map[v] = f"2025-06-01T00:00:00Z"

    # Add the target version published within the window
    versions[ver] = {
        "name": pkg,
        "version": ver,
        "description": "Target release",
        "dist": {"tarball": f"https://registry.npmjs.org/{pkg}/-/{pkg}-{ver}.tgz"}
    }
    time_map[ver] = "2026-03-03T16:00:00Z"

    large_payload = json.dumps({"name": pkg, "versions": versions, "time": time_map})
    payload_size = len(large_payload.encode("utf-8"))
    assert payload_size > 32 * 1024, f"Payload should exceed 32 KB (was {payload_size} bytes)"

    # Within the 256 KB safety cap, this realistic package response is handled safely
    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, large_payload, status=200)

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "RELEASED"
    assert escrow["publish_time"] == "2026-03-03T16:00:00Z"
    assert len(emit_spy.emits) == 1

    # Now verify handling when response exceeds the 256 KB cap (> 262,144 bytes)
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_huge = fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, template=NPM, pkg="huge-pkg", ver="1.0.0", nonce=99)
    huge_versions = {f"0.{i}.0": {"name": "huge-pkg", "padding": "x" * 500} for i in range(600)}
    huge_payload = json.dumps({"name": "huge-pkg", "versions": huge_versions, "time": {"1.0.0": "2026-03-03T00:00:00Z"}})
    assert len(huge_payload.encode("utf-8")) > 256 * 1024

    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob
    mock_registry(direct_vm, huge_payload, status=200)
    base_contract.release(id_huge)
    # Exceeding the safety cap must leave escrow OPEN (no false refund)
    assert base_contract.get_escrow(id_huge)["status"] == "OPEN"
    assert base_contract.get_escrow(id_huge)["match_reason"] == "EARLY_OVERSIZE_RETRYABLE"


# ---------------------------------------------------------------------------
# 7. Removal of wall-clock fallback in _now_dt: fails explicitly
# ---------------------------------------------------------------------------

def test_now_dt_fails_explicitly_when_tx_timestamp_unavailable(base_contract, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    # Set transaction datetime to empty string
    direct_vm._datetime = ""
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"

    # Contract must fail explicitly rather than falling back to host wall-clock time
    with pytest.raises(Exception, match="transaction timestamp unavailable"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, nonce=0)


# ---------------------------------------------------------------------------
# 8. Scoped npm package support
# ---------------------------------------------------------------------------

def test_scoped_npm_package_success(base_contract, direct_vm, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 20 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    scoped_pkg = "@shiplock/test-pkg"
    ver = "2.1.0"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=scoped_pkg, ver=ver)

    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, load_fix("npm_scoped_published.json"), status=200)

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "RELEASED"
    assert escrow["package_name"] == scoped_pkg
    assert escrow["version"] == ver
    assert len(emit_spy.emits) == 1
    assert emit_spy.emits[0][1] == amount


# ---------------------------------------------------------------------------
# 9. Boundary behavior at window_end_utc
# ---------------------------------------------------------------------------

def test_no_hit_refund_boundary_at_window_end(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount)

    # 1. Exactly 1 second BEFORE window_end (2026-03-09T23:59:59Z)
    direct_vm.warp("2026-03-09T23:59:59Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_404_RETRYABLE"
    assert len(emit_spy.emits) == 0
    assert base_contract.get_economics()["escrowed_open"] == amount

    # 2. Exactly AT window_end (2026-03-10T00:00:00Z)
    direct_vm.warp("2026-03-10T00:00:00Z")
    emit_spy.clear()

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "REFUND_NOHIT"
    assert escrow["match_reason"] == "WINDOW_EXPIRED_NO_RELEASE"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_alice)
    assert emit_spy.emits[0][1] == amount

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["refunded_to_funders"] == amount


# ---------------------------------------------------------------------------
# 10. Publication timestamp inside window settles after window_end
# ---------------------------------------------------------------------------

def test_in_window_publish_timestamp_settles_after_window_end(base_contract, direct_vm, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount)

    direct_vm.warp("2026-03-14T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, load_fix("pypi_published.json"), status=200)

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "RELEASED"
    assert escrow["match_reason"] == "200_IN_WINDOW"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_bob)
    assert emit_spy.emits[0][1] == amount

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["paid_to_recipients"] == amount


# ---------------------------------------------------------------------------
# 11. Real PyPI parsing: multi-file and yanked release
# ---------------------------------------------------------------------------

def test_pypi_multi_file_earliest_non_yanked_selected(base_contract, direct_vm, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)

    # PyPI response with 3 files (earliest non-yanked is file 3 at 2026-03-02T12:00:00Z)
    # Notice: NO "releases" field!
    multi_file_resp = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False
        },
        "urls": [
            {
                "filename": "f1.tar.gz",
                "upload_time_iso_8601": "2026-03-01T10:00:00Z",
                "yanked": True
            },
            {
                "filename": "f2.whl",
                "upload_time_iso_8601": "2026-03-02T16:00:00Z",
                "yanked": False
            },
            {
                "filename": "f3.tar.gz",
                "upload_time_iso_8601": "2026-03-02T12:00:00Z",
                "yanked": False
            }
        ]
    })
    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, multi_file_resp, status=200)

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "RELEASED"
    assert escrow["publish_time"] == "2026-03-02T12:00:00Z"
    assert escrow["yanked"] is False
    assert len(emit_spy.emits) == 1

def test_release_yanked_refunds_funder(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)

    direct_vm.warp("2026-03-12T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_yanked.json"), status=200)
    direct_vm.sender = direct_bob
    emit_spy.clear()

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "REFUND_NOHIT"
    assert escrow["match_reason"] == "YANKED"
    assert escrow["yanked"] is True
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_alice)


# ---------------------------------------------------------------------------
# 12. Economics & Balances for Every Transition
# ---------------------------------------------------------------------------

def test_economics_for_every_state_transition(base_contract, direct_vm, direct_bob):
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    direct_vm.warp("2026-01-01T00:00:00Z")

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0

    id1 = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", 10 * WEI, nonce=1)
    id2 = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", 5 * WEI, nonce=2)
    id3 = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", 2 * WEI, nonce=3)

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 17 * WEI
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0

    direct_vm.warp("2026-02-01T00:00:00Z")
    base_contract.cancel(id3)
    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 15 * WEI
    assert eco["refunded_to_funders"] == 2 * WEI

    direct_vm.warp("2026-03-04T00:00:00Z")
    direct_vm.sender = direct_bob
    base_contract.release(id1)
    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 15 * WEI

    mock_registry(direct_vm, load_fix("pypi_published.json"), status=200)
    base_contract.release(id1)
    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 5 * WEI
    assert eco["paid_to_recipients"] == 10 * WEI
    assert eco["refunded_to_funders"] == 2 * WEI

    direct_vm.warp("2026-03-11T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    base_contract.release(id2)
    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["paid_to_recipients"] == 10 * WEI
    assert eco["refunded_to_funders"] == 7 * WEI


# ---------------------------------------------------------------------------
# 13. Reverts and edge cases
# ---------------------------------------------------------------------------

def test_fund_inside_window_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-03-02T00:00:00Z")
    with pytest.raises(Exception, match="now <= window_start - 24h violated"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)

def test_fund_less_than_24h_before_start_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-02-28T12:00:00Z")
    with pytest.raises(Exception, match="now <= window_start - 24h violated"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)

def test_window_over_14_days_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    with pytest.raises(Exception, match="1 day <= window_end - window_start <= 14 days violated"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-20T00:00:00Z", 10 * WEI)

def test_latest_and_url_in_name_revert(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    with pytest.raises(Exception, match="invalid name or version"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI, pkg="http://evil")
    with pytest.raises(Exception, match="invalid name or version"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI, ver="latest")

def test_funder_equals_recipient_reverts(base_contract, direct_vm, direct_alice):
    direct_vm.warp("2026-01-01T00:00:00Z")
    with pytest.raises(Exception, match=r"recipient equals funder"):
        fund(base_contract, direct_vm, direct_alice, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)

def test_funder_release_reverts(base_contract, direct_vm, direct_bob, direct_alice):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)
    direct_vm.warp("2026-03-02T00:00:00Z")
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="Funder cannot release"):
        base_contract.release(id_hash)

def test_cancel_after_start_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)
    direct_vm.warp("2026-03-02T00:00:00Z")
    with pytest.raises(Exception, match="now < window_start violated"):
        base_contract.cancel(id_hash)

def test_release_before_window_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)
    direct_vm.warp("2026-02-01T00:00:00Z")
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="window_start <= now < expire_at violated"):
        base_contract.release(id_hash)

def test_release_twice_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", 10 * WEI)
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_published.json"), status=200)
    direct_vm.sender = direct_bob
    base_contract.release(id_hash)

    with pytest.raises(Exception, match="not OPEN"):
        base_contract.release(id_hash)

def test_expire_before_grace_reverts_after_grace_refunds(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)

    direct_vm.warp("2026-03-15T00:00:00Z")
    with pytest.raises(Exception, match="now >= expire_at violated"):
        base_contract.expire(id_hash)

    direct_vm.warp("2026-03-18T00:00:00Z")
    emit_spy.clear()
    base_contract.expire(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "EXPIRED"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_alice)
    assert emit_spy.emits[0][1] == amount

def test_list_ids_matches_get_escrow_ids(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI, nonce=1)
    fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 20 * WEI, nonce=2)
    assert base_contract.list_ids() == base_contract.get_escrow_ids()
    assert len(base_contract.list_ids()) == 2

def test_withdraw_no_credit_reverts(base_contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="no credit"):
        base_contract.withdraw()

def test_matching_application_flow_end_to_end(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 50 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-08T00:00:00Z"
    nonce = 1337

    escrow_id = fund(base_contract, direct_vm, direct_bob, start, end, amount, nonce=nonce)
    assert escrow_id.startswith("0x")

    escrow = base_contract.get_escrow(escrow_id)
    assert escrow["status"] == "OPEN"
    assert escrow["amount"] == amount
    assert escrow["nonce"] == nonce

    # During window, check before release is inconclusive (404) -> stays OPEN
    direct_vm.warp("2026-03-03T12:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    base_contract.release(escrow_id)
    assert base_contract.get_escrow(escrow_id)["status"] == "OPEN"
    assert addr_hex(base_contract.get_escrow(escrow_id)["releaser"]) == "0x0000000000000000000000000000000000000000"
    assert len(emit_spy.emits) == 0

    # Package releases on PyPI with valid upload time
    mock_registry(direct_vm, load_fix("pypi_published.json"), status=200)

    # Beneficiary releases -> funds transfer to recipient
    direct_vm.warp("2026-03-04T12:00:00Z")
    base_contract.release(escrow_id)

    escrow = base_contract.get_escrow(escrow_id)
    assert escrow["status"] == "RELEASED"
    assert escrow["payout"] == amount
    assert escrow["refund"] == 0
    assert addr_hex(escrow["releaser"]) == addr_hex(direct_bob)
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_bob)
    assert emit_spy.emits[0][1] == amount

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["paid_to_recipients"] == amount
    assert eco["refunded_to_funders"] == 0


# ---------------------------------------------------------------------------
# 28. Incomplete HTTP 200 Evidence Tests: npm and PyPI
# ---------------------------------------------------------------------------

def test_npm_missing_time_timestamp_inconclusive_leaves_open_no_transfer(base_contract, direct_vm, direct_bob, emit_spy):
    """npm response has exact versions[ver] object matching name/ver, but time[ver] timestamp is missing.
    Must be classified as inconclusive, never RELEASED and never REFUND_NOHIT.
    Before and after window_end, leaves escrow OPEN with 0 transfer and unchanged economics."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 20 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    pkg = "partial-npm-test"
    ver = "1.0.0"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=pkg, ver=ver)

    # Incomplete response: has versions[ver], but missing time[ver]
    npm_no_time = json.dumps({
        "name": pkg,
        "versions": {
            ver: {
                "name": pkg,
                "version": ver,
                "description": "Has version object but no timestamp"
            }
        },
        "time": {
            "created": "2026-02-01T00:00:00Z"
            # ver key is missing!
        }
    })

    # 1. Before window_end (2026-03-05)
    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, npm_no_time, status=200)

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_INCONCLUSIVE_RETRYABLE"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0

    # 2. At or after window_end (2026-03-12)
    direct_vm.warp("2026-03-12T00:00:00Z")
    emit_spy.clear()

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "POST_WINDOW_INCONCLUSIVE"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0


def test_npm_missing_versions_object_inconclusive_leaves_open_no_transfer(base_contract, direct_vm, direct_bob, emit_spy):
    """npm response has valid time[ver] timestamp, but versions[ver] object is missing.
    Must be classified as inconclusive, never RELEASED and never REFUND_NOHIT."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 20 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    pkg = "partial-npm-test-2"
    ver = "1.0.0"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=pkg, ver=ver)

    # Incomplete response: has time[ver], but versions map does not have ver
    npm_no_version_obj = json.dumps({
        "name": pkg,
        "versions": {},
        "time": {
            "created": "2026-02-01T00:00:00Z",
            ver: "2026-03-04T12:00:00Z"
        }
    })

    # Before window_end
    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, npm_no_version_obj, status=200)

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_INCONCLUSIVE_RETRYABLE"
    assert len(emit_spy.emits) == 0

    # At/after window_end
    direct_vm.warp("2026-03-12T00:00:00Z")
    emit_spy.clear()

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "POST_WINDOW_INCONCLUSIVE"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0


def test_npm_mismatched_version_object_or_invalid_time_inconclusive(base_contract, direct_vm, direct_bob, emit_spy):
    """npm versions[ver] object has wrong package name or time[ver] has unparseable timestamp.
    Must be classified as inconclusive, leaves escrow OPEN with no transfer."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 20 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    pkg = "mismatch-npm-test"
    ver = "1.0.0"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=pkg, ver=ver)

    # 1. versions[ver] has mismatched package name
    npm_mismatched_ver_obj = json.dumps({
        "name": pkg,
        "versions": {
            ver: {
                "name": "wrong-package-name",
                "version": ver
            }
        },
        "time": {
            ver: "2026-03-04T12:00:00Z"
        }
    })

    direct_vm.warp("2026-03-12T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, npm_mismatched_ver_obj, status=200)

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "POST_WINDOW_INCONCLUSIVE"
    assert len(emit_spy.emits) == 0

    # 2. time[ver] has invalid unparseable timestamp
    npm_invalid_timestamp = json.dumps({
        "name": pkg,
        "versions": {
            ver: {
                "name": pkg,
                "version": ver
            }
        },
        "time": {
            ver: "unparseable-date-string"
        }
    })

    emit_spy.clear()
    mock_registry(direct_vm, npm_invalid_timestamp, status=200)

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "POST_WINDOW_INCONCLUSIVE"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount


def test_pypi_empty_urls_does_not_use_info_timestamp_leaves_open(base_contract, direct_vm, direct_bob, emit_spy):
    """PyPI HTTP 200 with info-level timestamp but empty urls[] must NOT be treated as success.
    Must be classified as inconclusive, leaving escrow OPEN with no transfer before and after window_end."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 25 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount)

    # PyPI response has info.upload_time, but urls[] is empty
    pypi_empty_urls = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False,
            "upload_time": "2026-03-05T12:00:00",
            "upload_time_iso": "2026-03-05T12:00:00Z"
        },
        "urls": []
    })

    # 1. Before window_end (2026-03-06): leaves escrow OPEN, no transfer
    direct_vm.warp("2026-03-06T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, pypi_empty_urls, status=200)

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_INCONCLUSIVE_RETRYABLE"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0

    # 2. At or after window_end (2026-03-12): still leaves escrow OPEN, no transfer
    direct_vm.warp("2026-03-12T00:00:00Z")
    emit_spy.clear()

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "POST_WINDOW_INCONCLUSIVE"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0


def test_pypi_unusable_file_timestamp_leaves_open(base_contract, direct_vm, direct_bob, emit_spy):
    """PyPI response has files in urls[], but timestamps are missing or unparseable.
    Must be classified as inconclusive, leaving escrow OPEN with no transfer."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 15 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount)

    pypi_bad_file_time = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False
        },
        "urls": [
            {
                "filename": "shiplock_test-1.0.0.tar.gz",
                "upload_time_iso_8601": "not-a-valid-date-stamp",
                "yanked": False
            }
        ]
    })

    direct_vm.warp("2026-03-12T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, pypi_bad_file_time, status=200)

    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "POST_WINDOW_INCONCLUSIVE"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount


def test_fund_escrow_rejects_incomplete_evidence(base_contract, direct_vm, direct_bob):
    """fund_escrow must reject lookback responses that return incomplete HTTP 200 evidence."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"

    # 1. npm response with versions[ver] but missing time[ver]
    npm_no_time = json.dumps({
        "name": "npm-gate-test",
        "versions": {"1.0.0": {"name": "npm-gate-test", "version": "1.0.0"}},
        "time": {}
    })
    mock_registry(direct_vm, npm_no_time, status=200)
    with pytest.raises(Exception, match="lookback response inconclusive"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, template=NPM, pkg="npm-gate-test", ver="1.0.0", nonce=101)

    # 2. PyPI response with empty urls[]
    pypi_empty_urls = json.dumps({
        "info": {"name": "pypi-gate-test", "version": "1.0.0", "yanked": False, "upload_time": "2026-03-01T00:00:00Z"},
        "urls": []
    })
    mock_registry(direct_vm, pypi_empty_urls, status=200)
    with pytest.raises(Exception, match="lookback response inconclusive"):
        fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI, template=PYPI, pkg="pypi-gate-test", ver="1.0.0", nonce=102)


def test_final_nohit_allowed_for_verified_timestamp_outside_window(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    """At or after window_end, a verified, time-stamped publication outside the window settles as REFUND_NOHIT.
    Published at 2026-03-12 when window ended at 2026-03-10 -> PUBLISHED_AFTER_WINDOW with refund to funder."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 20 * WEI
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount)

    # Verified PyPI publication with valid non-yanked file, but uploaded after window_end
    pypi_late_pub = json.dumps({
        "info": {"name": PKG, "version": VER, "yanked": False},
        "urls": [
            {
                "filename": "late_file.tar.gz",
                "upload_time_iso_8601": "2026-03-12T15:00:00Z",
                "yanked": False
            }
        ]
    })

    direct_vm.warp("2026-03-14T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, pypi_late_pub, status=200)

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "REFUND_NOHIT"
    assert escrow["match_reason"] == "PUBLISHED_AFTER_WINDOW"
    assert escrow["publish_time"] == "2026-03-12T15:00:00Z"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_alice)
    assert emit_spy.emits[0][1] == amount

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == amount


def test_npm_missing_or_malformed_versions_or_time_maps_cannot_fund_or_refund(base_contract, direct_vm, direct_bob, emit_spy):
    """A 200 package response such as {"name":"target"} with missing or malformed versions or time maps
    is inconclusive.
    It CANNOT permit funding (rejected by fund_escrow) and CANNOT cause REFUND_NOHIT after window_end."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 20 * WEI
    target_pkg = "minimal-npm-pkg"
    target_ver = "1.0.0"

    # 1. Body {"name": "minimal-npm-pkg"} without versions or time maps cannot permit funding
    minimal_body = json.dumps({"name": target_pkg})
    mock_registry(direct_vm, minimal_body, status=200)
    with pytest.raises(Exception, match="lookback response inconclusive"):
        fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=target_pkg, ver=target_ver, nonce=10)

    # Malformed (non-dict) versions / time maps cannot permit funding
    mock_registry(direct_vm, json.dumps({"name": target_pkg, "versions": "not-a-dict", "time": {}}), status=200)
    with pytest.raises(Exception, match="lookback response inconclusive"):
        fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=target_pkg, ver=target_ver, nonce=11)

    mock_registry(direct_vm, json.dumps({"name": target_pkg, "versions": {}, "time": "not-a-dict"}), status=200)
    with pytest.raises(Exception, match="lookback response inconclusive"):
        fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=target_pkg, ver=target_ver, nonce=12)

    # 2. Fund escrow properly with verified 404 (both maps exist and empty)
    valid_absent_body = json.dumps({"name": target_pkg, "versions": {}, "time": {}})
    mock_registry(direct_vm, valid_absent_body, status=200)
    id_hash = fund(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=target_pkg, ver=target_ver, nonce=13)

    # 3. After window_end (2026-03-12), minimal_body cannot cause REFUND_NOHIT
    direct_vm.warp("2026-03-12T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()
    mock_registry(direct_vm, minimal_body, status=200)

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "POST_WINDOW_INCONCLUSIVE"
    # Releaser must remain unchanged (zero address) because settlement did NOT occur
    assert addr_hex(escrow["releaser"]) == "0x0000000000000000000000000000000000000000"
    assert len(emit_spy.emits) == 0

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == amount
    assert eco["paid_to_recipients"] == 0
    assert eco["refunded_to_funders"] == 0


# ---------------------------------------------------------------------------
# Verified Escrow (Source-Linked) Tests
# ---------------------------------------------------------------------------

def fund_verified(contract, direct_vm, recipient, window_start, window_end, amount, template=PYPI, pkg=PKG, ver=VER, expected_repo="shiplock-org/shiplock-core", expected_tag="v1.0.0", nonce=0):
    direct_vm.value = amount
    id_hash = contract.fund_verified_escrow(template, pkg, ver, expected_repo, expected_tag, recipient, window_start, window_end, nonce)
    direct_vm.value = 0
    return id_hash


def test_verified_escrow_input_validation_and_rejections(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 10 * WEI

    # Valid repo lookback mock
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)

    # Repository traversal rejected
    with pytest.raises(Exception, match=r"(path traversal|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="owner/../repo")

    # Scheme rejected
    with pytest.raises(Exception, match=r"(scheme|format|forbidden character)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="https://github.com/owner/repo")

    # Query string rejected
    with pytest.raises(Exception, match=r"(forbidden character|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="owner/repo?ref=main")

    # Fragment rejected
    with pytest.raises(Exception, match=r"(forbidden character|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="owner/repo#section")

    # Whitespace rejected
    with pytest.raises(Exception, match=r"(whitespace|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo=" owner/repo ")

    # Control chars / newline rejected
    with pytest.raises(Exception, match=r"(control character|whitespace|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="owner/repo\n")

    # Trailing .git rejected
    with pytest.raises(Exception, match=r"(\.git|repo|syntax)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="pallets/flask.git")
    with pytest.raises(Exception, match=r"(\.git|repo|syntax)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="owner/repo.git")

    # Unicode letters rejected in repo
    with pytest.raises(Exception, match=r"(non-ASCII|whitespace|control character|invalid character)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="octocat/héllo-world")
    with pytest.raises(Exception, match=r"(non-ASCII|whitespace|control character|invalid character)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="öwner/repo")

    # Single segment rejected
    with pytest.raises(Exception, match=r"(owner/repo format|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="owner")

    # Three segments rejected (extra slash)
    with pytest.raises(Exception, match=r"(owner/repo format|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="owner/repo/extra")
    with pytest.raises(Exception, match=r"(owner/repo format|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="/owner/repo")
    with pytest.raises(Exception, match=r"(owner/repo format|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="owner/repo/")

    # Repo length boundaries: 127 and 128 valid, 129 rejected
    repo_127 = "a" * 38 + "/" + "b" * 88 # len 127
    assert len(repo_127) == 127
    id_127 = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo=repo_127, nonce=901)
    assert base_contract.get_escrow(id_127)["status"] == "OPEN"

    repo_128 = "a" * 38 + "/" + "b" * 89 # len 128
    assert len(repo_128) == 128
    id_128 = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo=repo_128, nonce=902)
    assert base_contract.get_escrow(id_128)["status"] == "OPEN"

    repo_129 = "a" * 38 + "/" + "b" * 90 # len 129
    assert len(repo_129) == 129
    with pytest.raises(Exception, match=r"(length|bounds|format)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo=repo_129)

    # Valid hyphen, underscore, and dot cases in repo
    id_chars = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo="my-org-123/my-repo_v1.0.core", nonce=903)
    assert base_contract.get_escrow(id_chars)["status"] == "OPEN"

    # Tag validation: slashes rejected
    with pytest.raises(Exception, match=r"(separator|tag|forbidden character)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag="release/v1.0.0")

    # Tag traversal rejected
    with pytest.raises(Exception, match=r"(\.\.|tag)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag="../v1.0")

    # Tag whitespace rejected
    with pytest.raises(Exception, match=r"(whitespace|tag)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag=" v1.0.0 ")
    with pytest.raises(Exception, match=r"(whitespace|tag)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag="v1 0")

    # Tag control chars rejected
    with pytest.raises(Exception, match=r"(control character|whitespace|tag)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag="v1.0.0\t")
    with pytest.raises(Exception, match=r"(control character|whitespace|tag)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag="v1.0.0\n")

    # Unicode letters rejected in tag
    with pytest.raises(Exception, match=r"(non-ASCII|whitespace|control character|forbidden character)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag="v1.0.0-β")
    with pytest.raises(Exception, match=r"(non-ASCII|whitespace|control character|forbidden character)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag="v1.0.0-ü")

    # Tag length boundaries: 127 and 128 valid, 129 rejected
    tag_127 = "v" * 127
    id_tag_127 = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag=tag_127, nonce=904)
    assert base_contract.get_escrow(id_tag_127)["status"] == "OPEN"

    tag_128 = "v" * 128
    id_tag_128 = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag=tag_128, nonce=905)
    assert base_contract.get_escrow(id_tag_128)["status"] == "OPEN"

    tag_129 = "v" * 129
    with pytest.raises(Exception, match=r"(length|bounds|tag)"):
        fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag=tag_129)

    # Valid hyphen, underscore, and dot cases in tag
    id_tag_chars = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_tag="v1.0.0-rc_1.patch", nonce=906)
    assert base_contract.get_escrow(id_tag_chars)["status"] == "OPEN"


def test_verified_escrow_deterministic_id_and_audit_fields(base_contract, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 15 * WEI
    repo = "shiplock-org/shiplock-core"
    tag = "v1.0.0"
    nonce = 77

    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)

    funder_hex = addr_hex(direct_alice)
    payee_hex = addr_hex(direct_bob)
    preimage = f"{funder_hex}|{payee_hex}|{PYPI}|{PKG}|{VER}|{repo}|{tag}|{start}|{end}|{amount}|{nonce}".encode("utf-8")
    expected_id = "0x" + hashlib.sha256(preimage).hexdigest()

    id_hash = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, expected_repo=repo, expected_tag=tag, nonce=nonce)
    assert id_hash == expected_id

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["policy"] == "SOURCE_LINKED"
    assert escrow["expected_repo"] == repo
    assert escrow["expected_tag"] == tag
    assert escrow["package_name"] == PKG
    assert escrow["package"] == PKG
    assert escrow["version"] == VER
    assert addr_hex(escrow["recipient"]) == addr_hex(direct_bob)
    assert addr_hex(escrow["funder"]) == addr_hex(direct_alice)
    assert escrow["status"] == "OPEN"
    assert escrow["registry_evidence"] == ""
    assert escrow["github_evidence"] == ""
    assert escrow["match_reason"] == "LOOKBACK_404_OK"


def test_npm_verified_release_success(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    """Full end-to-end verified release for an npm package with valid repo and tag."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 25 * WEI
    pkg = "verified-npm-pkg"
    ver = "1.0.0"
    repo = "shiplock-org/shiplock-core"
    tag = "v1.0.0"

    # 1. Lookback at fund time
    mock_registry(direct_vm, json.dumps({"name": pkg, "versions": {}, "time": {}}), status=200)
    id_hash = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, template=NPM, pkg=pkg, ver=ver, expected_repo=repo, expected_tag=tag, nonce=101)

    # 2. Warp to active window
    direct_vm.warp("2026-03-03T12:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()

    npm_body = json.dumps({
        "name": pkg,
        "versions": {
            ver: {
                "name": pkg,
                "version": ver,
                "repository": {
                    "type": "git",
                    "url": "git+https://github.com/shiplock-org/shiplock-core.git"
                }
            }
        },
        "time": {
            ver: "2026-03-02T15:00:00Z"
        }
    })

    gh_body = json.dumps({
        "tag_name": tag,
        "published_at": "2026-03-02T14:30:00Z",
        "draft": False,
        "prerelease": False
    })

    mock_registry(direct_vm, {
        r"registry\.npmjs\.org": (npm_body, 200),
        r"api\.github\.com": (gh_body, 200)
    })

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "RELEASED"
    assert escrow["match_reason"] == "VERIFIED_RELEASE"
    assert escrow["policy"] == "SOURCE_LINKED"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_bob)
    assert emit_spy.emits[0][1] == amount

    # Audit evidence fields populated
    reg_ev = json.loads(escrow["registry_evidence"])
    assert reg_ev["kind"] == "200"
    assert reg_ev["repository"] == "shiplock-org/shiplock-core"
    assert reg_ev["publish_time"] == "2026-03-02T15:00:00Z"

    gh_ev = json.loads(escrow["github_evidence"])
    assert gh_ev["kind"] == "200"
    assert gh_ev["tag_name"] == tag
    assert gh_ev["published_at"] == "2026-03-02T14:30:00Z"

    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["paid_to_recipients"] == amount
    assert eco["refunded_to_funders"] == 0


def test_pypi_verified_release_success(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    """Full end-to-end verified release for a PyPI package with valid project_urls and tag."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 30 * WEI
    repo = "shiplock-org/shiplock-core"
    tag = "v1.0.0"

    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, template=PYPI, pkg=PKG, ver=VER, expected_repo=repo, expected_tag=tag, nonce=102)

    direct_vm.warp("2026-03-04T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()

    pypi_body = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False,
            "project_urls": {
                "Source Code": "https://github.com/shiplock-org/shiplock-core"
            }
        },
        "urls": [
            {
                "filename": f"{PKG}-{VER}.tar.gz",
                "upload_time_iso_8601": "2026-03-02T10:00:00Z",
                "yanked": False
            }
        ]
    })

    gh_body = json.dumps({
        "tag_name": tag,
        "published_at": "2026-03-02T09:00:00Z",
        "draft": False,
        "prerelease": False
    })

    mock_registry(direct_vm, {
        r"pypi\.org": (pypi_body, 200),
        r"api\.github\.com": (gh_body, 200)
    })

    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "RELEASED"
    assert escrow["match_reason"] == "VERIFIED_RELEASE"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_bob)
    assert emit_spy.emits[0][1] == amount


def test_verified_escrow_active_window_mismatches_stay_open(base_contract, direct_vm, direct_bob, emit_spy):
    """During active window, repo mismatch or tag mismatch leaves escrow OPEN and retryable."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 20 * WEI
    repo = "shiplock-org/shiplock-core"
    tag = "v1.0.0"

    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, template=PYPI, pkg=PKG, ver=VER, expected_repo=repo, expected_tag=tag, nonce=103)

    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob

    # 1. PyPI points to wrong repo
    wrong_repo_pypi = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False,
            "project_urls": {"Homepage": "https://github.com/imposter-org/wrong-repo"}
        },
        "urls": [{"upload_time_iso_8601": "2026-03-02T10:00:00Z", "yanked": False}]
    })
    gh_body = json.dumps({"tag_name": tag, "published_at": "2026-03-02T09:00:00Z", "draft": False, "prerelease": False})

    emit_spy.clear()
    mock_registry(direct_vm, {r"pypi\.org": (wrong_repo_pypi, 200), r"api\.github\.com": (gh_body, 200)})
    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_REGISTRY_MISMATCH_RETRYABLE"
    assert len(emit_spy.emits) == 0

    # 2. PyPI has correct repo, but GitHub returns different tag
    correct_pypi = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False,
            "project_urls": {"Source": f"https://github.com/{repo}"}
        },
        "urls": [{"upload_time_iso_8601": "2026-03-02T10:00:00Z", "yanked": False}]
    })
    wrong_tag_gh = json.dumps({"tag_name": "v2.0.0-rc1", "published_at": "2026-03-02T09:00:00Z", "draft": False, "prerelease": False})

    mock_registry(direct_vm, {r"pypi\.org": (correct_pypi, 200), r"api\.github\.com": (wrong_tag_gh, 200)})
    base_contract.release(id_hash)

    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_GITHUB_TAG_MISMATCH_RETRYABLE"
    assert len(emit_spy.emits) == 0


def test_verified_escrow_active_window_failures_and_transport_stay_open(base_contract, direct_vm, direct_bob, emit_spy):
    """During active window, GitHub 404, 403, 429, 500, or invalid JSON leaves escrow OPEN."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 20 * WEI
    repo = "shiplock-org/shiplock-core"
    tag = "v1.0.0"

    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, template=PYPI, pkg=PKG, ver=VER, expected_repo=repo, expected_tag=tag, nonce=104)

    direct_vm.warp("2026-03-05T00:00:00Z")
    direct_vm.sender = direct_bob

    correct_pypi = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False,
            "project_urls": {"Source": f"https://github.com/{repo}"}
        },
        "urls": [{"upload_time_iso_8601": "2026-03-02T10:00:00Z", "yanked": False}]
    })

    # GitHub 404
    mock_registry(direct_vm, {r"pypi\.org": (correct_pypi, 200), r"api\.github\.com": ("Not Found", 404)})
    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_GITHUB_404_RETRYABLE"

    # GitHub 403 rate limit / auth
    mock_registry(direct_vm, {r"pypi\.org": (correct_pypi, 200), r"api\.github\.com": ("Forbidden", 403)})
    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_GITHUB_UNAVAILABLE_RETRYABLE"

    # GitHub 500 server error
    mock_registry(direct_vm, {r"pypi\.org": (correct_pypi, 200), r"api\.github\.com": ("Server Error", 500)})
    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_GITHUB_UNAVAILABLE_RETRYABLE"

    # GitHub malformed JSON
    mock_registry(direct_vm, {r"pypi\.org": (correct_pypi, 200), r"api\.github\.com": ("{not json", 200)})
    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_GITHUB_UNAVAILABLE_RETRYABLE"

    # Registry failure + GitHub success
    gh_body = json.dumps({"tag_name": tag, "published_at": "2026-03-02T09:00:00Z", "draft": False, "prerelease": False})
    mock_registry(direct_vm, {r"pypi\.org": ("Server Error", 500), r"api\.github\.com": (gh_body, 200)})
    base_contract.release(id_hash)
    escrow = base_contract.get_escrow(id_hash)
    assert escrow["status"] == "OPEN"
    assert escrow["match_reason"] == "EARLY_REGISTRY_UNAVAILABLE_RETRYABLE"
    assert len(emit_spy.emits) == 0


def test_verified_escrow_post_window_settlement_and_inconclusive_safety(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    """Post-window behavior:
    1. Conclusive mismatch or absent evidence -> REFUND_NOHIT to funder.
    2. Transport failure / inconclusive -> remains OPEN to protect both parties."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 20 * WEI
    repo = "shiplock-org/shiplock-core"
    tag = "v1.0.0"

    # Escrow 1: Repo mismatch post-window -> REFUND_NOHIT
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id1 = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, template=PYPI, pkg=PKG, ver=VER, expected_repo=repo, expected_tag=tag, nonce=105)

    direct_vm.warp("2026-03-12T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()

    wrong_repo_pypi = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False,
            "project_urls": {"Homepage": "https://github.com/other-org/other-repo"}
        },
        "urls": [{"upload_time_iso_8601": "2026-03-02T10:00:00Z", "yanked": False}]
    })
    gh_body = json.dumps({"tag_name": tag, "published_at": "2026-03-02T09:00:00Z", "draft": False, "prerelease": False})

    mock_registry(direct_vm, {r"pypi\.org": (wrong_repo_pypi, 200), r"api\.github\.com": (gh_body, 200)})
    base_contract.release(id1)

    escrow1 = base_contract.get_escrow(id1)
    assert escrow1["status"] == "REFUND_NOHIT"
    assert escrow1["match_reason"] == "REGISTRY_REPO_MISMATCH"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_alice)
    assert emit_spy.emits[0][1] == amount

    # Escrow 2: Post-window GitHub 503 transport failure -> remains OPEN!
    direct_vm.warp("2026-01-01T00:00:00Z")
    direct_vm.sender = direct_alice
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id2 = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, template=PYPI, pkg=PKG, ver=VER, expected_repo=repo, expected_tag=tag, nonce=106)

    direct_vm.warp("2026-03-12T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()

    correct_pypi = json.dumps({
        "info": {
            "name": PKG,
            "version": VER,
            "yanked": False,
            "project_urls": {"Source": f"https://github.com/{repo}"}
        },
        "urls": [{"upload_time_iso_8601": "2026-03-02T10:00:00Z", "yanked": False}]
    })
    mock_registry(direct_vm, {r"pypi\.org": (correct_pypi, 200), r"api\.github\.com": ("Service Unavailable", 503)})
    base_contract.release(id2)

    escrow2 = base_contract.get_escrow(id2)
    assert escrow2["status"] == "OPEN"
    assert escrow2["match_reason"] == "POST_WINDOW_GITHUB_UNAVAILABLE"
    assert len(emit_spy.emits) == 0

    # Escrow 3: Post-window GitHub tag absent (404) -> REFUND_NOHIT
    direct_vm.warp("2026-01-01T00:00:00Z")
    direct_vm.sender = direct_alice
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id3 = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, template=PYPI, pkg=PKG, ver=VER, expected_repo=repo, expected_tag=tag, nonce=107)

    direct_vm.warp("2026-03-12T00:00:00Z")
    direct_vm.sender = direct_bob
    emit_spy.clear()

    mock_registry(direct_vm, {r"pypi\.org": (correct_pypi, 200), r"api\.github\.com": ("Not Found", 404)})
    base_contract.release(id3)

    escrow3 = base_contract.get_escrow(id3)
    assert escrow3["status"] == "REFUND_NOHIT"
    assert escrow3["match_reason"] == "WINDOW_EXPIRED_GITHUB_NO_RELEASE"
    assert len(emit_spy.emits) == 1
    assert addr_hex(emit_spy.emits[0][0]) == addr_hex(direct_alice)


def test_verified_escrow_security_and_double_settlement(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    """Preserves:
    - Funder cannot release their own verified escrow
    - Double release / double settlement reverts
    - Expire grace refunds if not settled"""
    direct_vm.warp("2026-01-01T00:00:00Z")
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-10T00:00:00Z"
    amount = 20 * WEI
    repo = "shiplock-org/shiplock-core"
    tag = "v1.0.0"

    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund_verified(base_contract, direct_vm, direct_bob, start, end, amount, template=PYPI, pkg=PKG, ver=VER, expected_repo=repo, expected_tag=tag, nonce=108)

    # 1. Funder cannot call release
    direct_vm.warp("2026-03-04T00:00:00Z")
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match=r"(Funder cannot release|funder)"):
        base_contract.release(id_hash)

    # 2. Release cleanly by payee
    direct_vm.sender = direct_bob
    pypi_body = json.dumps({
        "info": {"name": PKG, "version": VER, "yanked": False, "project_urls": {"Source": f"https://github.com/{repo}"}},
        "urls": [{"upload_time_iso_8601": "2026-03-02T10:00:00Z", "yanked": False}]
    })
    gh_body = json.dumps({"tag_name": tag, "published_at": "2026-03-02T09:00:00Z", "draft": False, "prerelease": False})
    mock_registry(direct_vm, {r"pypi\.org": (pypi_body, 200), r"api\.github\.com": (gh_body, 200)})

    base_contract.release(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "RELEASED"

    # 3. Double release reverts
    with pytest.raises(Exception, match=r"(not OPEN|escrow not open)"):
        base_contract.release(id_hash)

    # 4. Expire on released escrow reverts
    direct_vm.warp("2026-04-01T00:00:00Z")
    with pytest.raises(Exception, match=r"(not OPEN|escrow not open)"):
        base_contract.expire(id_hash)


def test_normalize_github_repo_url_security_regression(base_contract):
    """Direct contract verification of strict GitHub repo URL normalization grammar."""
    import sys
    contract_cls = getattr(base_contract, "_contract", base_contract).__class__
    mod = sys.modules.get(contract_cls.__module__)
    if mod is None:
        for m in sys.modules.values():
            if getattr(m, "ShipLock", None) == contract_cls or getattr(m, "_normalize_github_repo_url", None) is not None:
                mod = m
                break
    assert mod is not None, "Could not find ShipLock module in sys.modules"
    normalize = getattr(mod, "_normalize_github_repo_url")

    # Must reject:
    must_reject = [
        "https://evil.example/github.com/owner/repo",
        "https://notgithub.com/owner/repo",
        "git@evilgithub.com:owner/repo",
        "https://github.com.evil/owner/repo",
        "https://github.com/owner/repo/issues",
        "https://github.com/owner/repo/tree/main",
        "github://owner/repo",
        "https://github.com:443/owner/repo",
    ]
    for url in must_reject:
        assert normalize(url) == "", f"Should have rejected '{url}'"

    # Must accept and normalize to owner/repo:
    must_accept = [
        ("https://github.com/Owner/Repo", "owner/repo"),
        ("https://github.com/Owner/Repo.git", "owner/repo"),
        ("git+https://github.com/Owner/Repo.git", "owner/repo"),
        ("ssh://git@github.com/Owner/Repo", "owner/repo"),
        ("git@github.com:Owner/Repo.git", "owner/repo"),
        ("github:Owner/Repo", "owner/repo"),
        ("Owner/Repo", "owner/repo"),
    ]
    for url, expected in must_accept:
        assert normalize(url) == expected, f"Failed to normalize '{url}' to '{expected}', got '{normalize(url)}'"

