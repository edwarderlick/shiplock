import re
text = open('out_conftest.txt').read()

text = re.sub(
    r'        try:\n            from genlayer\.types import Address\n            import genlayer\.calldata as gl_calldata\n        except ImportError:\n            from genlayer\.py\.types import Address[^\n]*\n            import genlayer\.py\.calldata as gl_calldata[^\n]*',
    '''        try:
            from genlayer.types import Address
            import genlayer.calldata as gl_calldata
        except ImportError:
            class Address:
                def __init__(self, v): self.v = v
                def as_bytes(self): return getattr(self.v, "as_bytes", lambda: self.v)()
                def __eq__(self, other): return str(self) == str(other)
            class gl_calldata:
                @staticmethod
                def encode(d): return b""''',
    text
)

text = re.sub(
    r'        try:\n            from genlayer\.std import Lazy\n        except ImportError:\n            from genlayer\.py\.std import Lazy[^\n]*',
    '''        try:
            from genlayer.std import Lazy
        except ImportError:
            Lazy = lambda fn: fn()''',
    text
)

text = re.sub(
    r'        try:\n            from genlayer\.storage\.core import ROOT_SLOT_ID\n            from genlayer\.storage\._internal\.generate import \(\n                ORIGINAL_INIT_ATTR,\n                _BuilderCtx,\n                _storage_build,\n            \)\n\n            td = _storage_build\(_BuilderCtx\.empty\(\), contract_cls\)\n        except ImportError:\n            from genlayer\.py\.storage\._internal\.core import ROOT_SLOT_ID[^\n]*\n            from genlayer\.py\.storage\._internal\.generate import \([^\n]*\n                ORIGINAL_INIT_ATTR,\n                _BuilderCtx,\n                _storage_build,\n            \)\n\n            td = _storage_build\(_BuilderCtx\.empty\(\), contract_cls\)',
    '''        # SDK path is guaranteed to be injected here
        from genlayer.storage.core import ROOT_SLOT_ID
        from genlayer.storage._internal.generate import (
            ORIGINAL_INIT_ATTR,
            _BuilderCtx,
            _storage_build,
        )

        td = _storage_build(_BuilderCtx.empty(), contract_cls)''',
    text
)

text = re.sub(
    r'        try:\n            from genlayer\.types import Address, u256\n        except ImportError:\n            from genlayer\.py\.types import Address, u256[^\n]*',
    '''        try:
            from genlayer.types import Address, u256
        except ImportError:
            Address = type(self.sender) if hasattr(self.sender, "as_bytes") else str
            u256 = type(self._value) if hasattr(self._value, "to_bytes") else int''',
    text
)

open('tests/direct/conftest.py', 'w').write(text)
