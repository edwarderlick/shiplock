import os
import shutil

os.makedirs('tests/direct', exist_ok=True)
os.makedirs('tests/fixtures', exist_ok=True)

with open('tests/fixtures/pypi_published.json', 'w') as f:
    f.write('{"info": {"name": "shiplock-test", "version": "1.0.0", "yanked": false, "upload_time_iso": "2026-03-05T12:00:00Z"}}')

with open('tests/fixtures/pypi_yanked.json', 'w') as f:
    f.write('{"info": {"name": "shiplock-test", "version": "1.0.0", "yanked": true, "upload_time_iso": "2026-03-05T12:00:00Z"}}')

with open('tests/fixtures/pypi_404.json', 'w') as f:
    f.write('{"message": "Not Found"}')

with open('tests/fixtures/npm_published.json', 'w') as f:
    f.write('{"name": "shiplock-test", "version": "1.0.0", "yanked": false, "time": {"1.0.0": "2026-03-05T12:00:00Z"}}')

with open('tests/fixtures/non_json.txt', 'w') as f:
    f.write('<html><body>Not JSON</body></html>')

with open('tests/fixtures/oversize_note.txt', 'w') as f:
    f.write('A' * 33000)

with open('out_conftest.txt', 'r', encoding='utf-8') as src, open('tests/direct/conftest.py', 'w', encoding='utf-8') as dst:
    content = src.read()
    # Modify for shiplock
    content = content.replace('mock_fda', 'mock_registry')
    content = content.replace('empty_fda', 'empty_registry')
    content = content.replace(r'".*api\.fda\.gov.*"', r'".*(pypi\.org|npmjs\.org).*"')
    content = content.replace('empty.json', 'pypi_404.json')
    content = content.replace('deploy_funded', 'deploy_shiplock')
    content = content.replace('contracts/recallline.py', 'contracts/shiplock.py')
    content = content.replace('contract.fund_pool()', '') # Shiplock doesn\'t have fund_pool
    # Remove direct_vm.value = pool because deploy_shiplock doesn't need payable init
    content = content.replace('direct_vm.value = pool', 'direct_vm.value = 0')
    dst.write(content)
