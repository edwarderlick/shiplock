import json
import re
import sys
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

def load_fix(name: str) -> str:
    if not name.endswith('.json') and not name.endswith('.txt'):
        name += '.json'
    fix_path = FIXTURES_DIR / name
    return fix_path.read_text(encoding="utf-8")

class MockResponse:
    def __init__(self, json_str, status=200):
        self.json_str = json_str
        self.text = json_str if isinstance(json_str, str) else json_str.decode("utf-8", errors="replace")
        self.body = json_str.encode("utf-8") if isinstance(json_str, str) else json_str
        self.status = status
        self.status_code = status
        self._dict = None
        if status == 200:
            try:
                self._dict = json.loads(self.text)
            except Exception:
                self._dict = None
    
    def json(self):
        if self._dict is not None:
            return self._dict
        return json.loads(self.text)
        
    def get(self, key, default=None):
        if self._dict is not None:
            return self._dict.get(key, default)
        return default

def mock_registry(vm, target, status=200):
    """
    Mock web responses for registry queries.
    `target` can be:
      - A string body (JSON or error text) with a status code
      - A dictionary mapping regex pattern -> (body, status) or dict
      - A callable handler taking (url: str) -> MockResponse
    """
    def _handler(url: str):
        if callable(target):
            res = target(url)
            if isinstance(res, MockResponse):
                return res
            if isinstance(res, tuple):
                return MockResponse(res[0], res[1])
            return MockResponse(str(res), 200)
        if isinstance(target, dict):
            for pat, val in target.items():
                if re.search(pat, url):
                    if isinstance(val, tuple):
                        return MockResponse(val[0], val[1])
                    if isinstance(val, dict):
                        return MockResponse(val.get("body", ""), val.get("status", 200))
                    return MockResponse(str(val), 200)
            return MockResponse("Not Found", 404)
        return MockResponse(target, status)

    # Patch VM web mock if available
    if vm is not None and hasattr(vm, "clear_mocks") and hasattr(vm, "mock_web"):
        vm.clear_mocks()
        if isinstance(target, str):
            vm.mock_web(r".*", {"status": status, "body": target})
        elif isinstance(target, dict):
            for pat, val in target.items():
                if isinstance(val, tuple):
                    vm.mock_web(pat, {"status": val[1], "body": val[0]})
                elif isinstance(val, dict):
                    vm.mock_web(pat, {"status": val.get("status", 200), "body": val.get("body", "")})
                else:
                    vm.mock_web(pat, {"status": 200, "body": str(val)})

    # Patch loaded contract's genlayer module
    for mod_name, mod in list(sys.modules.items()):
        if getattr(mod, 'ShipLock', None) or 'contracts.shiplock' in mod_name:
            if hasattr(mod, 'gl') and hasattr(mod.gl, 'nondet') and hasattr(mod.gl.nondet, 'web'):
                mod.gl.nondet.web.get = _handler

def empty_registry(vm):
    mock_registry(vm, load_fix("pypi_404.json"), status=404)
