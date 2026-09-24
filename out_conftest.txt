from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

import pytest

# Windows: gltest closes the temp stdin fd after dup2, so genlayer.gl sees EOF.
# Keep the backing fd open and replay encoded message if fd0 reads empty.
def _patch_windows_message_inject() -> None:
    import gltest.direct.sdk_compat as sdk_compat
    import gltest.direct.wasi_mock as wasi_mock

    def _import_calldata():
        try:
            import genlayer.calldata as calldata
        except ImportError:
            import genlayer.py.calldata as calldata  # type: ignore[no-redef]

        return calldata

    sdk_compat.import_calldata = _import_calldata
    wasi_mock.import_calldata = _import_calldata

    import gltest.direct.loader as loader

    if getattr(loader._inject_message_to_fd0, "_rl_patched", False):
        return

    def _inject(vm):
        try:
            from genlayer.types import Address
            import genlayer.calldata as gl_calldata
        except ImportError:
            from genlayer.py.types import Address  # type: ignore[no-redef]
            from genlayer.py import calldata as gl_calldata  # type: ignore[no-redef]

        def as_addr(v):
            if isinstance(v, bytes):
                return Address(v)
            return v

        message_data = {
            "contract_address": as_addr(vm._contract_address),
            "sender_address": as_addr(vm.sender),
            "origin_address": as_addr(getattr(vm, "origin", vm.sender)),
            "stack": [],
            "value": vm._value,
            "datetime": vm._datetime,
            "is_init": False,
            "chain_id": vm._chain_id,
            "entry_kind": 0,
            "entry_data": b"",
            "entry_stage_data": None,
        }
        encoded = gl_calldata.encode(message_data)
        vm._encoded_msg = encoded
        fd, path = tempfile.mkstemp()
        os.write(fd, encoded)
        os.lseek(fd, 0, os.SEEK_SET)
        if getattr(vm, "_original_stdin_fd", None) is None:
            try:
                vm._original_stdin_fd = os.dup(0)
            except OSError:
                pass
        os.dup2(fd, 0)
        vm._keep_msg_fd = fd
        vm._keep_msg_path = path
        os.lseek(0, 0, os.SEEK_SET)

    _inject._rl_patched = True  # type: ignore[attr-defined]
    loader._inject_message_to_fd0 = _inject

    def _allocate(contract_cls, vm, *args, **kwargs):
        try:
            from genlayer.storage.core import ROOT_SLOT_ID
            from genlayer.storage._internal.generate import (
                ORIGINAL_INIT_ATTR,
                _BuilderCtx,
                _storage_build,
            )

            td = _storage_build(_BuilderCtx.empty(), contract_cls)
        except ImportError:
            from genlayer.py.storage._internal.core import ROOT_SLOT_ID  # type: ignore[no-redef]
            from genlayer.py.storage._internal.generate import (  # type: ignore[no-redef]
                ORIGINAL_INIT_ATTR,
                _storage_build,
            )

            td = _storage_build(contract_cls, {})
        slot = vm._storage.get_store_slot(ROOT_SLOT_ID)
        instance = td.get(slot, 0)
        init = getattr(getattr(td, "cls", contract_cls), "__init__", None)
        if init is not None and hasattr(init, ORIGINAL_INIT_ATTR):
            init = getattr(init, ORIGINAL_INIT_ATTR)
        if init is not None:
            init(instance, *args, **kwargs)
        return instance

    loader._allocate_contract = _allocate

    def _patch_gl_vm():
        try:
            import genlayer.vm as gl_vm
        except ImportError:
            import genlayer.gl.vm as gl_vm  # type: ignore[no-redef]
        try:
            from genlayer.types import Lazy
        except ImportError:
            from genlayer.py.types import Lazy  # type: ignore[no-redef]

        if getattr(gl_vm, "_rl_direct", False):
            return

        def eager(leader_fn, validator_fn, /, **kwargs):
            from gltest.direct.wasi_mock import get_vm

            vm = get_vm()
            vm._in_nondet = True
            try:
                return leader_fn()
            finally:
                vm._in_nondet = False

        def lazy(leader_fn, validator_fn, /, **kwargs):
            return Lazy(lambda: eager(leader_fn, validator_fn, **kwargs))

        eager.lazy = lazy
        gl_vm.run_nondet_unsafe = eager
        gl_vm.run_nondet = eager
        gl_vm.run_nondet_default = eager
        gl_vm._rl_direct = True

    _orig_allocate = loader._allocate_contract

    def _allocate_and_patch(contract_cls, vm, *args, **kwargs):
        inst = _orig_allocate(contract_cls, vm, *args, **kwargs)
        _patch_gl_vm()
        return inst

    loader._allocate_contract = _allocate_and_patch

    _OrigFileIO = io.FileIO

    class _FileIO(_OrigFileIO):
        def readall(self):
            data = super().readall()
            if data:
                return data
            try:
                from gltest.direct.wasi_mock import get_vm

                enc = getattr(get_vm(), "_encoded_msg", b"")
                if enc:
                    return enc
            except Exception:
                pass
            return data

    io.FileIO = _FileIO  # type: ignore

    import gltest.direct.vm as vm_mod

    orig_refresh = vm_mod.VMContext._refresh_gl_message

    def _refresh(self):
        orig_refresh(self)
        import sys

        gl_mod = sys.modules.get("genlayer") or sys.modules.get("genlayer.gl")
        raw_mod = sys.modules.get("genlayer.message") or sys.modules.get("genlayer._internal.msg")
        if gl_mod is None:
            return
        try:
            from genlayer.types import Address, u256
        except ImportError:
            from genlayer.py.types import Address, u256  # type: ignore[no-redef]

        def as_addr(v):
            if v is None:
                return None
            if isinstance(v, Address):
                return v
            if isinstance(v, bytes):
                return Address(v)
            if hasattr(v, "as_bytes"):
                return Address(v.as_bytes)
            return v

        raw = getattr(raw_mod, "raw", None) if raw_mod is not None else None
        if not isinstance(raw, dict):
            raw = getattr(raw_mod, "message_raw", None) if raw_mod is not None else None
        if not isinstance(raw, dict):
            raw = getattr(gl_mod, "message_raw", None)
        if not isinstance(raw, dict):
            raw = {}
        raw["value"] = self._value
        raw["datetime"] = self._datetime
        raw["sender_address"] = as_addr(self.sender)
        raw["origin_address"] = as_addr(self.origin)
        raw["contract_address"] = as_addr(self._contract_address)
        raw["chain_id"] = self._chain_id
        MessageType = getattr(gl_mod, "MessageType", None)
        if MessageType is not None and isinstance(raw, dict):
            gl_mod.message = MessageType(
                contract_address=as_addr(self._contract_address),
                sender_address=as_addr(self.sender),
                origin_address=as_addr(self.origin),
                value=u256(self._value),
                chain_id=u256(self._chain_id),
            )
            gl_mod.message_raw = raw
        msg_mod = sys.modules.get("genlayer.message")
        if msg_mod is not None and isinstance(raw, dict):
            msg_mod.raw = raw
            msg_mod.value = u256(self._value)
            msg_mod.sender_address = as_addr(self.sender)
            msg_mod.origin_address = as_addr(self.origin)
            msg_mod.contract_address = as_addr(self._contract_address)
            msg_mod.chain_id = u256(self._chain_id)

    vm_mod.VMContext._refresh_gl_message = _refresh


_patch_windows_message_inject()

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
WEI = 10**18
NDC = "0069-4210-66"
NDC2 = "0078-0442-15"


def load_fix(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def mock_fda(direct_vm, body: str, status: int = 200) -> None:
    direct_vm.clear_mocks()
    direct_vm.mock_web(
        r".*api\.fda\.gov.*",
        {"status": status, "body": body},
    )


def empty_fda(direct_vm) -> None:
    mock_fda(direct_vm, load_fix("empty.json"))


@pytest.fixture
def wei():
    return WEI


@pytest.fixture
def clock(direct_vm):
    # 24h+ before 2026-03-04 window start
    direct_vm.warp("2026-03-01T00:00:00Z")
    return direct_vm


def deploy_funded(direct_vm, direct_deploy, direct_alice, pool: int = 10_000 * WEI):
    empty_fda(direct_vm)
    contract = direct_deploy("contracts/recallline.py")
    direct_vm.sender = direct_alice
    direct_vm.deal(direct_alice, pool * 4)
    direct_vm.value = pool
    contract.fund_pool()
    direct_vm.value = 0
    return contract
