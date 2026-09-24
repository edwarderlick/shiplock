import pytest
from utils import mock_registry, load_fix, empty_registry

WEI = 10**18
PKG = "shiplock-test"
VER = "1.0.0"
PYPI = "PYPI_VERSION"
NPM = "NPM_VERSION"

# We mock _Recipient.emit_transfer to capture emits
class EmitMock:
    def __init__(self):
        self.calls = []
    
    def __call__(self, value):
        self.calls.append(value)
        # return None for success

@pytest.fixture
def emit_spy(monkeypatch, direct_deploy):
    # We will patch the actual class when needed
    class Spy:
        def __init__(self):
            self.emits = []
    return Spy()

def patch_recipient(direct_vm, contract, emit_spy):
    # genlayer loads contracts dynamically. 
    # Since we don't have access to the exact loaded module easily,
    # we can just patch contract._pay for test assertions if needed.
    # Actually, the best way to test emit_transfer is to patch _Recipient in the module
    import sys
    # Find the loaded module for the contract
    for mod_name, mod in sys.modules.items():
        if getattr(mod, 'ShipLock', None) == contract.__class__:
            class DummyRecipient:
                def __init__(self, addr):
                    self.addr = addr
                def emit_transfer(self, value):
                    emit_spy.emits.append((self.addr, value))
            mod._Recipient = DummyRecipient
            return
    
    # Fallback to patching _pay directly if module hacking fails
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

def fund(contract, direct_vm, recipient, window_start, window_end, amount, template=PYPI, pkg=PKG, ver=VER):
    direct_vm.value = amount
    id_hash = contract.fund_escrow(template, pkg, ver, recipient, window_start, window_end)
    direct_vm.value = 0
    return id_hash

def test_five_concurrent_fund_distinct_hash_ids(base_contract, direct_vm, direct_bob):
    ids = set()
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    for i in range(5):
        direct_vm.warp(f"2026-01-01T12:00:0{i}Z")
        start = "2026-03-01T00:00:00Z"
        end = "2026-03-05T00:00:00Z"
        ids.add(fund(base_contract, direct_vm, direct_bob, start, end, 10 * WEI))
    assert len(ids) == 5
    for id in ids:
        assert str(id).startswith("0x")
        assert len(str(id)) == 66
        assert str(id) not in ("1", "2", "3", "4", "5")

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

def test_funder_equals_recipient_reverts(base_contract, direct_vm, direct_alice, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    with pytest.raises(Exception, match=r"recipient equals funder"):
        fund(base_contract, direct_vm, type(direct_bob)(f"0x{direct_alice.hex()}"), "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)

def test_lookback_already_published_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_published.json"))
    with pytest.raises(Exception, match="already published"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)

def test_lookback_already_yanked_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_yanked.json"))
    with pytest.raises(Exception, match="already yanked"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)

def test_lookback_unavailable_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, "bad", status=500)
    with pytest.raises(Exception, match="lookback evidence unavailable"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)
    mock_registry(direct_vm, load_fix("non_json.txt"), status=200)
    with pytest.raises(Exception, match="lookback evidence unavailable"):
        fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)

def test_lookback_404_allows_fund(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)
    assert id_hash is not None

def test_funder_release_reverts(base_contract, direct_vm, direct_bob, direct_alice):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)
    direct_vm.warp("2026-03-02T00:00:00Z")
    direct_vm.sender = direct_alice # funder
    with pytest.raises(Exception, match="Funder cannot release"):
        base_contract.release(id_hash)

def test_cancel_before_start_pays_funder(base_contract, direct_vm, direct_bob, direct_alice, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", amount)
    
    direct_vm.warp("2026-02-01T00:00:00Z")
    emit_spy.emits.clear()
    base_contract.cancel(id_hash)
    
    assert base_contract.get_escrow(id_hash)["status"] == "CANCELED"
    # Should pay funder
    assert len(emit_spy.emits) == 1
    assert emit_spy.emits[0][0] == type(direct_bob)(f"0x{direct_alice.hex()}")
    assert emit_spy.emits[0][1] == amount

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

def test_release_published_in_window_pays_recipient(base_contract, direct_vm, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)
    
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_published.json"))
    direct_vm.sender = direct_bob
    emit_spy.emits.clear()
    
    base_contract.release(id_hash)
    
    assert base_contract.get_escrow(id_hash)["status"] == "RELEASED"
    assert len(emit_spy.emits) == 1
    assert emit_spy.emits[0][0] == direct_bob
    assert emit_spy.emits[0][1] == amount

def test_release_yanked_refunds_funder(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)
    
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_yanked.json"))
    direct_vm.sender = direct_bob
    emit_spy.emits.clear()
    
    base_contract.release(id_hash)
    
    assert base_contract.get_escrow(id_hash)["status"] == "REFUND_NOHIT"
    assert len(emit_spy.emits) == 1
    assert emit_spy.emits[0][0] == type(direct_bob)(f"0x{direct_alice.hex()}")

def test_release_404_refunds_funder_nohit(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)
    
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    direct_vm.sender = direct_bob
    emit_spy.emits.clear()
    
    base_contract.release(id_hash)
    
    assert base_contract.get_escrow(id_hash)["status"] == "REFUND_NOHIT"
    assert emit_spy.emits[0][0] == type(direct_bob)(f"0x{direct_alice.hex()}")

def test_release_5xx_insufficient_refunds_funder(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)
    
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, "bad", status=500)
    direct_vm.sender = direct_bob
    emit_spy.emits.clear()
    
    base_contract.release(id_hash)
    
    assert base_contract.get_escrow(id_hash)["status"] == "INSUFFICIENT"
    assert emit_spy.emits[0][0] == type(direct_bob)(f"0x{direct_alice.hex()}")

def test_release_non_json_insufficient(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)
    
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, load_fix("non_json.txt"), status=200)
    direct_vm.sender = direct_bob
    emit_spy.emits.clear()
    
    base_contract.release(id_hash)
    
    assert base_contract.get_escrow(id_hash)["status"] == "INSUFFICIENT"
    assert emit_spy.emits[0][0] == type(direct_bob)(f"0x{direct_alice.hex()}")

def test_release_twice_reverts(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    amount = 10 * WEI
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", amount)
    
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_published.json"))
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
        
    direct_vm.warp("2026-03-18T00:00:00Z") # Expired
    emit_spy.emits.clear()
    base_contract.expire(id_hash)
    assert base_contract.get_escrow(id_hash)["status"] == "EXPIRED"
    assert emit_spy.emits[0][0] == type(direct_bob)(f"0x{direct_alice.hex()}")

def test_fake_id_cannot_release_or_withdraw(base_contract, direct_vm, direct_bob):
    with pytest.raises(Exception, match="escrow not found"):
        base_contract.release("0x123")
    with pytest.raises(Exception, match="no credit"):
        base_contract.withdraw()

def test_withdraw_no_credit_reverts_and_cancel_emits(base_contract, direct_vm, direct_alice, direct_bob, emit_spy):
    with pytest.raises(Exception, match="no credit"):
        base_contract.withdraw()
        
    # Cancel emits
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    id_hash = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", 10 * WEI)
    
    direct_vm.warp("2026-02-01T00:00:00Z")
    emit_spy.emits.clear()
    base_contract.cancel(id_hash)
    assert len(emit_spy.emits) == 1

def test_list_ids_matches_get_escrow_ids(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)
    fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z", 10 * WEI)
    
    assert base_contract.list_ids() == base_contract.get_escrow_ids()
    assert len(base_contract.list_ids()) == 2

def test_get_economics_moves_on_release_and_refund(base_contract, direct_vm, direct_bob):
    direct_vm.warp("2026-01-01T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    
    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    
    id1 = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", 10 * WEI)
    id2 = fund(base_contract, direct_vm, direct_bob, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", 5 * WEI)
    
    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 15 * WEI
    
    direct_vm.warp("2026-03-06T00:00:00Z")
    mock_registry(direct_vm, load_fix("pypi_published.json"))
    direct_vm.sender = direct_bob
    base_contract.release(id1)
    
    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 5 * WEI
    assert eco["paid_to_recipients"] == 10 * WEI
    
    mock_registry(direct_vm, load_fix("pypi_404.json"), status=404)
    base_contract.release(id2)
    
    eco = base_contract.get_economics()
    assert eco["escrowed_open"] == 0
    assert eco["paid_to_recipients"] == 10 * WEI
    assert eco["refunded_to_funders"] == 5 * WEI
