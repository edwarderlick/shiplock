"""
ShipLock Deployment Script - Studio Next (Chain ID 61997)
Replaces the legacy Python deployer with the verified TypeScript deployment pipeline
using genlayer-js@2.0.0-rc.1, studioDevnet chain definition, and web/src/fee-profile.json.

Security policy:
- New deployer wallet only (never defaults to keystore.json or historical test keys)
- Secrets provided via DEPLOYER_PRIVATE_KEY or GENLAYER_PRIVATE_KEY environment variable
- Secrets kept out of source code, logs, and Git

Usage:
  python deploy.py --dry-run      # Validate setup without sending a transaction
  python deploy.py                # Deploy with funded wallet (requires DEPLOYER_PRIVATE_KEY)

Direct npm command:
  npm --prefix web run deploy -- --dry-run
  DEPLOYER_PRIVATE_KEY="0x..." npm --prefix web run deploy
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent
    web_dir = root / "web"

    # Forward arguments to the verified npm deployment script
    cmd = ["npm", "run", "deploy"]
    if len(sys.argv) > 1:
        cmd.extend(["--", *sys.argv[1:]])

    is_windows = sys.platform == "win32"
    try:
        res = subprocess.run(cmd, cwd=str(web_dir), shell=is_windows)
        sys.exit(res.returncode)
    except FileNotFoundError:
        print("[-] Error: 'npm' command not found in PATH.", file=sys.stderr)
        print("    Please run the deployment directly from the web directory:", file=sys.stderr)
        print("    cd web && npm run deploy", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[-] Deployment execution error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
