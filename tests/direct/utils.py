import json

def load_fix(name):
    if not name.endswith('.json') and not name.endswith('.txt'):
        name += '.json'
    with open(f"tests/direct/fixtures/{name}") as f:
        return f.read()

def mock_registry(vm, json_str, status=200):
    import sys
    class MockResponse:
        def __init__(self, json_str, status):
            self.json_str = json_str
            self.text = json_str
            self.body = json_str.encode("utf-8")
            self.status = status
            if status == 200:
                import json
                try:
                    # GenVM 0.6 nondet.web.get() returns dict if json
                    self._dict = json.loads(json_str)
                except:
                    self._dict = None
            else:
                self._dict = None
        
        def json(self):
            import json
            return json.loads(self.json_str)
            
        def get(self, key, default=None):
            if self._dict is not None:
                return self._dict.get(key, default)
            return default

    # Patch the contract's genlayer module
    for k, mod in list(sys.modules.items()):
        if getattr(mod, 'ShipLock', None):
            mod.gl.nondet.web.get = lambda url: MockResponse(json_str, status)

def empty_registry(vm):
    pass
