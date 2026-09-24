import json
import os
from eth_account import Account

# Decrypt keystore
with open("keystore.json") as f:
    keystore = json.load(f)

private_key = Account.decrypt(keystore, "12345678").hex()

from genlayer import Genlayer
from genlayer import TransactionFees

client = Genlayer(
    rpc_url="https://studio-dev.genlayer.com/api",
    private_key=private_key
)

with open("contracts/shiplock.py") as f:
    contract_code = f.read()

print("Deploying...")
# Genlayer python SDK
tx_hash = client.deploy_contract(
    contract_code=contract_code,
    args=[],
    fees=TransactionFees(fee_value=1000000000000000000)
)
print(f"Hash: {tx_hash}")

receipt = client.wait_for_receipt(tx_hash)
print(f"Contract Address: {receipt.contract_address}")
