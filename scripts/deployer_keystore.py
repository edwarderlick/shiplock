"""
Secure Deployer Keystore Manager
Creates and unlocks locally encrypted, recoverable Web3 V3 keystores for ShipLock.

Security policies strictly enforced:
- Creates a brand-new deployer wallet using cryptographic randomness.
- Encrypts with user password using standard Web3 V3 (AES-128-CTR + Scrypt/PBKDF2).
- Saves exclusively to .deployer_keystore.json (ignored by Git).
- Never prints, logs, or exports the private key, seed phrase, or password.
- Passes decrypted key in memory directly to the deployment process environment.
- Never overwrites an existing keystore file.
- Preserves exact 40 hexadecimal address characters (preventing loss of leading zeroes).
- Treats RPC errors as balance-check failures rather than reporting zero balance.
"""

from __future__ import annotations

import getpass
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from eth_account import Account

KEYSTORE_PATH = Path(__file__).resolve().parent.parent / ".deployer_keystore.json"
STUDIO_RPC = "https://studio-dev.genlayer.com/api"


def validate_address(address: str) -> bool:
    """Validates that address is a 42-character 0x-prefixed hexadecimal string."""
    if not isinstance(address, str):
        return False
    if not (address.startswith("0x") or address.startswith("0X")):
        return False
    hex_part = address[2:]
    if len(hex_part) != 40:
        return False
    return all(c in "0123456789abcdefABCDEF" for c in hex_part)


def extract_and_validate_keystore_address(ks_data: dict) -> str:
    """Extracts and validates the 20-byte address from keystore data.

    Preserves the exact 40 hexadecimal characters from the keystore, avoiding
    .lstrip('0x') which erroneously strips leading zeroes.
    """
    raw_addr = ks_data.get("address", "")
    if not isinstance(raw_addr, str):
        raise ValueError(
            f"Invalid keystore: 'address' field must be a string, got {type(raw_addr).__name__}"
        )

    # Strip prefix '0x' or '0X' if present without removing leading zeroes
    if raw_addr.startswith("0x") or raw_addr.startswith("0X"):
        hex_part = raw_addr[2:]
    else:
        hex_part = raw_addr

    if len(hex_part) != 40 or not all(c in "0123456789abcdefABCDEF" for c in hex_part):
        raise ValueError(
            f"Invalid address in keystore: '{raw_addr}'. Expected exactly 40 hexadecimal characters."
        )

    address = "0x" + hex_part
    if not validate_address(address):
        raise ValueError(f"Address validation failed for resulting address: '{address}'")

    return address


def get_balance(address: str) -> int:
    """Queries eth_getBalance from Studio Next RPC.

    Treats RPC errors and network failures as exceptions rather than
    reporting a zero balance.
    """
    if not validate_address(address):
        raise ValueError(f"Cannot query balance for invalid address: '{address}'")

    req_body = json.dumps({
        "jsonrpc": "2.0",
        "method": "eth_getBalance",
        "params": [address, "latest"],
        "id": 1,
    }).encode("utf-8")
    req = urllib.request.Request(
        STUDIO_RPC,
        data=req_body,
        headers={"Content-Type": "application/json", "User-Agent": "genlayer-js"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "error" in data:
                raise RuntimeError(f"RPC returned error: {data['error']}")
            if "result" not in data:
                raise RuntimeError(f"RPC response missing 'result' field: {data}")
            result_hex = data["result"]
            return int(result_hex, 16)
    except Exception as e:
        raise RuntimeError(f"Balance check failed against RPC ({STUDIO_RPC}): {e}") from e


def create_keystore(
    keystore_path: Path = KEYSTORE_PATH, password: str | None = None
) -> tuple[dict, str]:
    """Generates a new Web3 V3 encrypted keystore.

    Strictly refuses to overwrite if keystore_path already exists.
    """
    if keystore_path.exists():
        raise FileExistsError(
            f"Keystore file already exists at '{keystore_path}'. Overwrite is prohibited."
        )

    if not password:
        raise ValueError("Password cannot be empty.")

    acc = Account.create()
    encrypted_keystore = Account.encrypt(acc.key.hex(), password)
    public_address = acc.address

    keystore_path.parent.mkdir(parents=True, exist_ok=True)
    with open(keystore_path, "w", encoding="utf-8") as f:
        json.dump(encrypted_keystore, f, indent=2)

    del acc
    return encrypted_keystore, public_address


def cmd_create():
    if KEYSTORE_PATH.exists():
        print(
            f"[-] Error: Keystore already exists at '{KEYSTORE_PATH}'. "
            "Refusing to overwrite existing keystore to protect wallet security.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("\n=== Create Brand-New Deployer Wallet ===")
    pwd1 = getpass.getpass("Enter password to encrypt new keystore: ")
    if not pwd1:
        print("[-] Error: Password cannot be empty.", file=sys.stderr)
        sys.exit(1)
    pwd2 = getpass.getpass("Confirm encryption password: ")
    if pwd1 != pwd2:
        print("[-] Error: Passwords do not match.", file=sys.stderr)
        sys.exit(1)

    try:
        _, public_address = create_keystore(KEYSTORE_PATH, pwd1)
    except FileExistsError as e:
        print(f"[-] Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        del pwd1
        del pwd2

    print(f"\n[+] Brand-new deployer wallet created successfully!")
    print(f"    Public Address : {public_address}")
    print(f"    Keystore File  : {KEYSTORE_PATH.name} (ignored by Git)")
    print("\nNext step: Fund this public address with test GEN on GenLayer Studio Next:")
    print(f"    Address: {public_address}")
    print("    Network: GenLayer Studio Next (Chain ID 61997)")
    print("    Faucet : Studio web interface (https://studio-dev.genlayer.com)")


def cmd_balance():
    if not KEYSTORE_PATH.exists():
        print(f"[-] No keystore found at '{KEYSTORE_PATH}'. Run 'create' first.", file=sys.stderr)
        sys.exit(1)

    with open(KEYSTORE_PATH, "r", encoding="utf-8") as f:
        ks_data = json.load(f)

    try:
        address = extract_and_validate_keystore_address(ks_data)
    except Exception as e:
        print(f"[-] Error: Keystore address validation failed: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        balance_wei = get_balance(address)
    except Exception as e:
        print(f"[-] Error: Balance check failed: {e}", file=sys.stderr)
        sys.exit(1)

    balance_gen = balance_wei / 10**18
    print(f"Public Address : {address}")
    print(f"Balance        : {balance_gen:.4f} GEN ({balance_wei} wei)")
    print(f"Network        : GenLayer Studio Next (Chain ID 61997)")


def cmd_address():
    if not KEYSTORE_PATH.exists():
        print(f"[-] No keystore found at '{KEYSTORE_PATH}'. Run 'create' first.", file=sys.stderr)
        sys.exit(1)

    with open(KEYSTORE_PATH, "r", encoding="utf-8") as f:
        ks_data = json.load(f)

    try:
        address = extract_and_validate_keystore_address(ks_data)
        print(address)
    except Exception as e:
        print(f"[-] Error: Keystore address validation failed: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_deploy():
    extra_args = sys.argv[2:]
    is_dry_run = "--dry-run" in extra_args

    if is_dry_run:
        root = Path(__file__).resolve().parent.parent
        cmd = ["npm", "--prefix", "web", "run", "deploy", "--", *extra_args]
        is_windows = sys.platform == "win32"
        try:
            res = subprocess.run(cmd, cwd=str(root), shell=is_windows)
            sys.exit(res.returncode)
        except Exception as e:
            print(f"[-] Error running dry-run deployment: {e}", file=sys.stderr)
            sys.exit(1)

    if not KEYSTORE_PATH.exists():
        print(f"[-] No keystore found at '{KEYSTORE_PATH}'. Run 'create' first.", file=sys.stderr)
        sys.exit(1)

    with open(KEYSTORE_PATH, "r", encoding="utf-8") as f:
        ks_data = json.load(f)

    try:
        address = extract_and_validate_keystore_address(ks_data)
    except Exception as e:
        print(f"[-] Error: Keystore address validation failed: {e}", file=sys.stderr)
        sys.exit(1)

    # Check balance, treating RPC errors as balance-check failures
    try:
        balance_wei = get_balance(address)
    except Exception as e:
        print(f"[-] Error: Balance check failed (RPC error): {e}", file=sys.stderr)
        print("    Deployment halted because wallet balance could not be verified via RPC.", file=sys.stderr)
        sys.exit(1)

    balance_gen = balance_wei / 10**18
    print(f"[+] Deployer Address : {address}")
    print(f"[+] Current Balance  : {balance_gen:.4f} GEN ({balance_wei} wei)")

    if balance_wei == 0:
        print("\n[-] Insufficient balance: Deployer address has 0 GEN.", file=sys.stderr)
        print(f"    Please fund address {address} on Studio Next before deploying.", file=sys.stderr)
        sys.exit(1)

    pwd = getpass.getpass("Enter password to unlock keystore for deployment: ")
    try:
        pk = Account.decrypt(ks_data, pwd).hex()
    except Exception as e:
        print(f"[-] Error: Failed to unlock keystore (invalid password or corrupted file): {e}", file=sys.stderr)
        sys.exit(1)

    if not pk.startswith("0x"):
        pk = "0x" + pk

    root = Path(__file__).resolve().parent.parent
    env = os.environ.copy()
    env["DEPLOYER_PRIVATE_KEY"] = pk

    del pwd

    cmd = ["npm", "--prefix", "web", "run", "deploy"]
    if extra_args:
        cmd.extend(["--", *extra_args])
    is_windows = sys.platform == "win32"
    try:
        res = subprocess.run(cmd, cwd=str(root), env=env, shell=is_windows)
        del pk
        sys.exit(res.returncode)
    except Exception as e:
        del pk
        print(f"[-] Error running deployment: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/deployer_keystore.py <create|balance|address|deploy>")
        sys.exit(1)

    action = sys.argv[1].lower()
    if action == "create":
        cmd_create()
    elif action == "balance":
        cmd_balance()
    elif action == "address":
        cmd_address()
    elif action == "deploy":
        cmd_deploy()
    else:
        print(f"[-] Unknown command '{action}'. Use create, balance, address, or deploy.")
        sys.exit(1)


if __name__ == "__main__":
    main()
