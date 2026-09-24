import re
text = open('out_conftest.txt').read()

text = re.sub(
    r'except ImportError:\s+from genlayer\.py\.std import Address[^\n]*\s+from genlayer\.py\.std import calldata as gl_calldata[^\n]*',
    '''except ImportError:
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
    r'except ImportError:\s+from genlayer\.py\.std import Lazy[^\n]*',
    r'except ImportError:\n            Lazy = lambda fn: fn()',
    text
)

text = re.sub(
    r'except ImportError:\s+from genlayer\.py\.storage\._internal\.core import ROOT_SLOT_ID.*td = _storage_build\(_BuilderCtx\.empty\(\), contract_cls\)',
    r'',
    text, flags=re.DOTALL
)

text = re.sub(
    r'except ImportError:\s+from genlayer\.py\.std import Address, u256[^\n]*',
    r'except ImportError:\n            Address = type(self.sender) if hasattr(self.sender, "as_bytes") else str\n            u256 = type(self._value) if hasattr(self._value, "to_bytes") else int',
    text
)

open('tests/direct/conftest.py', 'w').write(text)
