"""Unit tests for scripts/deployer_keystore.py

Verifies:
1. Exact preservation of 40 hexadecimal address characters, including addresses beginning with zeroes.
2. Address validation on extracted addresses.
3. Strict refusal to overwrite an existing keystore.
4. Treating RPC errors as balance-check failures rather than reporting a zero balance.
"""

from __future__ import annotations

import json
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import sys

# Ensure repo root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.deployer_keystore import (
    create_keystore,
    extract_and_validate_keystore_address,
    get_balance,
    validate_address,
    cmd_create,
)


class TestAddressPreservationAndValidation:
    """Tests address extraction, preserving leading zeroes and validating result."""

    def test_address_beginning_with_two_zeroes(self):
        """Keystore address starting with '00' must preserve all 40 hex characters."""
        raw_40_hex = "001234567890abcdef1234567890abcdef123456"
        ks_data = {"address": raw_40_hex}
        result = extract_and_validate_keystore_address(ks_data)

        # Must have 0x prefix and exact 40 hex chars (length 42)
        assert result == f"0x{raw_40_hex}"
        assert len(result) == 42
        assert result.startswith("0x00")
        assert validate_address(result) is True

    def test_address_beginning_with_four_zeroes(self):
        """Keystore address starting with '0000' must preserve all 40 hex characters."""
        raw_40_hex = "0000c0ffee1234567890abcdef12345678901234"
        ks_data = {"address": raw_40_hex}
        result = extract_and_validate_keystore_address(ks_data)

        assert result == f"0x{raw_40_hex}"
        assert len(result) == 42
        assert result.startswith("0x0000")
        assert validate_address(result) is True

    def test_address_with_existing_0x_prefix_and_leading_zeroes(self):
        """Keystore address that already has '0x' prefix and leading zeroes."""
        raw_40_hex = "00ab1234567890abcdef1234567890abcdef1234"
        ks_data = {"address": f"0x{raw_40_hex}"}
        result = extract_and_validate_keystore_address(ks_data)

        assert result == f"0x{raw_40_hex}"
        assert len(result) == 42
        assert result.startswith("0x00")

    def test_contrast_with_buggy_lstrip(self):
        """Demonstrates that old buggy lstrip('0x') would strip zeroes, whereas our fix preserves them."""
        raw_40_hex = "001234567890abcdef1234567890abcdef123456"
        # The buggy approach:
        buggy_result = "0x" + raw_40_hex.lstrip("0x")
        # Notice buggy result stripped the leading zeroes!
        assert buggy_result != f"0x{raw_40_hex}"
        assert len(buggy_result) < 42

        # Our fixed function preserves exact 40 characters:
        fixed_result = extract_and_validate_keystore_address({"address": raw_40_hex})
        assert fixed_result == f"0x{raw_40_hex}"
        assert len(fixed_result) == 42

    def test_invalid_address_length_rejected(self):
        """Addresses shorter or longer than 40 hex chars must raise ValueError."""
        # Too short (38 hex chars)
        with pytest.raises(ValueError, match="Expected exactly 40 hexadecimal characters"):
            extract_and_validate_keystore_address({"address": "1234567890abcdef1234567890abcdef123456"})

        # Too long (42 hex chars without 0x)
        with pytest.raises(ValueError, match="Expected exactly 40 hexadecimal characters"):
            extract_and_validate_keystore_address({"address": "00" + "1234567890abcdef1234567890abcdef123456" + "ff"})

    def test_non_hex_characters_rejected(self):
        """Addresses with non-hex characters must raise ValueError."""
        with pytest.raises(ValueError, match="Expected exactly 40 hexadecimal characters"):
            extract_and_validate_keystore_address({"address": "zz1234567890abcdef1234567890abcdef123456"})

    def test_missing_or_non_string_address_rejected(self):
        """Missing or non-string address fields must raise ValueError."""
        with pytest.raises(ValueError, match="must be a string"):
            extract_and_validate_keystore_address({"address": 12345})
        with pytest.raises(ValueError, match="Expected exactly 40 hexadecimal characters"):
            extract_and_validate_keystore_address({})


class TestRefuseOverwriteKeystore:
    """Tests that existing keystores are strictly protected from overwrite."""

    def test_create_keystore_refuses_to_overwrite_existing_file(self, tmp_path: Path):
        """create_keystore must raise FileExistsError if target keystore file already exists."""
        ks_file = tmp_path / ".deployer_keystore.json"
        initial_content = '{"protected": "do_not_overwrite"}'
        ks_file.write_text(initial_content, encoding="utf-8")

        # Attempt to create over the existing file
        with pytest.raises(FileExistsError, match="already exists"):
            create_keystore(ks_file, password="test_password_123")

        # Existing content must remain completely unchanged
        assert ks_file.read_text(encoding="utf-8") == initial_content

    def test_cmd_create_refuses_overwrite_cli(self, tmp_path: Path, monkeypatch):
        """cmd_create must exit with error without prompting for passwords if file exists."""
        ks_file = tmp_path / ".deployer_keystore.json"
        ks_file.write_text('{"existing": true}', encoding="utf-8")

        monkeypatch.setattr("scripts.deployer_keystore.KEYSTORE_PATH", ks_file)

        # getpass should NEVER be called
        mock_getpass = MagicMock(side_effect=AssertionError("getpass should not be invoked when keystore exists"))
        monkeypatch.setattr("getpass.getpass", mock_getpass)

        with pytest.raises(SystemExit) as exc_info:
            cmd_create()

        assert exc_info.value.code == 1
        assert ks_file.read_text(encoding="utf-8") == '{"existing": true}'


class TestRpcErrorHandling:
    """Tests that RPC errors are treated as balance-check failures rather than zero balance."""

    def test_rpc_network_error_raises_runtime_error(self):
        """Network/connection errors must raise RuntimeError, not return 0."""
        valid_addr = "0x001234567890abcdef1234567890abcdef123456"

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("Connection timed out")):
            with pytest.raises(RuntimeError, match="Balance check failed against RPC"):
                get_balance(valid_addr)

    def test_rpc_error_response_raises_runtime_error(self):
        """JSON-RPC error payload must raise RuntimeError, not return 0."""
        valid_addr = "0x001234567890abcdef1234567890abcdef123456"
        error_payload = json.dumps({
            "jsonrpc": "2.0",
            "error": {"code": -32000, "message": "Execution timeout"},
            "id": 1,
        }).encode("utf-8")

        mock_resp = MagicMock()
        mock_resp.read.return_value = error_payload
        mock_resp.__enter__.return_value = mock_resp

        with patch("urllib.request.urlopen", return_value=mock_resp):
            with pytest.raises(RuntimeError, match="RPC returned error"):
                get_balance(valid_addr)

    def test_rpc_missing_result_raises_runtime_error(self):
        """Missing result in JSON-RPC response must raise RuntimeError."""
        valid_addr = "0x001234567890abcdef1234567890abcdef123456"
        malformed_payload = json.dumps({"jsonrpc": "2.0", "id": 1}).encode("utf-8")

        mock_resp = MagicMock()
        mock_resp.read.return_value = malformed_payload
        mock_resp.__enter__.return_value = mock_resp

        with patch("urllib.request.urlopen", return_value=mock_resp):
            with pytest.raises(RuntimeError, match="missing 'result' field"):
                get_balance(valid_addr)

    def test_successful_rpc_returns_exact_balance(self):
        """Successful RPC returns parsed wei integer."""
        valid_addr = "0x001234567890abcdef1234567890abcdef123456"
        # 2 GEN = 2000000000000000000 wei = 0x1bc16d674ec80000
        success_payload = json.dumps({
            "jsonrpc": "2.0",
            "result": "0x1bc16d674ec80000",
            "id": 1,
        }).encode("utf-8")

        mock_resp = MagicMock()
        mock_resp.read.return_value = success_payload
        mock_resp.__enter__.return_value = mock_resp

        with patch("urllib.request.urlopen", return_value=mock_resp):
            balance = get_balance(valid_addr)
            assert balance == 2000000000000000000
