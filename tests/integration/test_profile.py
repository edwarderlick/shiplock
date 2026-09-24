import pytest

def test_profile_all(gl_client, default_account):
    contract_code = open("contracts/shiplock.py").read()
    contract = gl_client.deploy_contract(contract_code)
    
    # ... I need to know the gl_client API for 0.6 ...
