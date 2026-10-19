import os
import re

SAFE_HASHES = {
    '0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854',
    '0xe193586d4939aaf247788ee3526dda5e2d403eb5ca482606b4dbe954d3d5a355',
    '0x6a307ceab940e184215b576e5826c8f361e2fabe3f9eea4f6769cb6533ac7312',
    '0x1ac2eea7c83967a0abe667355598d3809fb2552cc5d4227ad7ba86fee09a3c46',
    '0xd25c4478f9bea148882fabc24620116aaa3d8281280e72115227b49aa2f9d617',
    '0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e',
    '0x2ce8683d5762d9b322b1a91ef0f1bc4f70cdbfabb4267a42a6e26f47951c640e',
    '0xdb6d919c7b4462d479917e8df1783a6a087053c80e24bf5bce2600f0fc56ab4e',
    '0xd450d74c9eee0d8ff4d92983bfc79ee55f01ef3609c4e6d0dd5fcb0c8867c2a3'
}

EXCLUDED_DIRS = ['.git', 'node_modules', '.next', '__pycache__', '.pytest_cache', '.vercel']
EXCLUDED_FILES = ['.deployer_keystore.json', '.env.local', 'keystore.json']

pem_findings = []
hex_findings = []

for root, dirs, files in os.walk('.'):
    # Skip ignored dirs
    if any(p in root.replace('\\', '/') for p in EXCLUDED_DIRS):
        continue
    for f in files:
        if f in EXCLUDED_FILES:
            continue
        filepath = os.path.join(root, f)
        norm_path = filepath.replace('\\', '/')
        try:
            content = open(filepath, 'r', encoding='utf-8', errors='ignore').read()
        except Exception:
            continue

        # Check 32-byte hex
        for m in re.finditer(r'0x[0-9a-fA-F]{64}', content):
            h = m.group(0)
            if h not in SAFE_HASHES and 'fixture' not in norm_path and 'test' not in norm_path:
                hex_findings.append((norm_path, '32-byte-hex', h))

        # Check private key headers
        if 'BEGIN' in content and 'KEY' in content:
            if re.search(r'-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY-----', content):
                pem_findings.append((norm_path, 'PEM-key', 'PRIVATE KEY BLOCK'))

total_findings = len(pem_findings) + len(hex_findings)

print("=== Secret Audit Report ===")
print("Audit Scope: Repository working-tree files subject to the exclusions below were scanned for PEM private keys and 32-byte hex candidate strings.")
print(f"Excluded Directories: {', '.join(EXCLUDED_DIRS)}")
print(f"Excluded Files: {', '.join(EXCLUDED_FILES)}")
print("Note: Passwords, API tokens, and local environment/keystore files are not scanned by this script.")
print()
print(f"Total findings: {total_findings}")
print(f" - Sensitive PEM-key findings: {len(pem_findings)}")
for f in pem_findings:
    print(f"   * {f[0]}: {f[1]} -> {f[2]}")
print(f" - Informational 32-byte hex candidates: {len(hex_findings)}")
for f in hex_findings:
    print(f"   * {f[0]}: {f[1]} -> {f[2]}")
