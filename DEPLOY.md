# ShipLock Deployment Guide

## Target Network Configuration (Studio Next)
- **Network**: Studio Next (`studio-dev`)
- **Chain ID**: `61997` (`0xF22D`)
- **Canonical RPC**: `https://studio-dev.genlayer.com/api`
- **Block Explorer**: `https://explorer-studio-dev.genlayer.com/`
- **Native Currency**: `GEN` (18 decimals)
- **Active Contract Address**: `0x7Cef756668Cd925807e8B110D0330643c6F809E3`
- **Active Deployment Tx**: [`0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854`](https://explorer-studio-dev.genlayer.com/tx/0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854)
- **Deployer Public Address**: `0x20E850BAaD26d763d4f691780D1BEBA01c8D6084`
- **Contract Source Hash**: `be743c1a8277716d21018911352fe9d7ccd3dd30fb1b8d829d19384133401a0e` (Verified 100% on-chain parity)
- **Steward Evidence & Report**: [EVIDENCE.md](./EVIDENCE.md)

---

## Verified Deployment Method: TypeScript SDK (`genlayer-js@2.0.0-rc.1`)

The verified deployment mechanism uses the installed `genlayer-js` SDK, the official `studioDevnet` chain definition (`chainId: 61997`), and the deployment fee profile in `fee-profile.json` (or `web/src/fee-profile.json`).

It executes the following workflow:
1. Validates the target network matches Studio Next (`61997`).
2. Estimates deployment transaction fees from `fee-profile.json` (`deploy` section).
3. Passes the returned fee `distribution` and `feeValue` unchanged to `client.deployContract`.
4. Waits for finalization (`waitUntil: "finalized"`).
5. Strictly enforces `FINALIZED` transaction status and confirmed successful execution (`FINISHED_WITH_RETURN`).
6. Extracts and validates the 20-byte contract address.
7. Reads back on-chain bytecode / source and validates SHA-256 equivalence against local `contracts/shiplock.py`.

### Security & Key Management Policy
- **New Deployer Wallet Only**: Never defaults to `keystore.json` or any historical test keys.
- **Secure Key Storage**: Encrypted Web3 V3 keystore saved exclusively to `.deployer_keystore.json` (ignored by Git) and/or cached in the OS keychain via GenLayer CLI (`keytar`).
- **Secrets Kept Safe**: Private keys are never printed, logged, or checked into Git.

---

### Step 1: Create and Fund a Fresh Deployer Wallet
1. Run the encrypted keystore creator:
   ```bash
   python scripts/deployer_keystore.py create
   ```
2. Fund the reported public address with test `GEN` on GenLayer Studio Next (via the Studio faucet or an existing safe funded account).
3. Check the balance:
   ```bash
   python scripts/deployer_keystore.py balance
   ```

### Step 2: Validate Setup (Dry-Run Mode)
Verify contract file presence, fee profile loading, and deployment readiness without sending a transaction:

```bash
python deploy.py --dry-run
# Or npm directly:
npm --prefix web run deploy -- --dry-run
```

Output:
```text
=== ShipLock Studio Next Contract Deployer ===
Chain: GenLayer Studio Devnet (Chain ID: 61997)
RPC: https://studio-dev.genlayer.com/api

[+] Dry-run validation:
    Contract size: 28456 bytes
    Fee profile loaded: deploy = {
  leaderTimeunitsAllocation: '125',
  validatorTimeunitsAllocation: '250',
  executionBudgetPerRound: '25000000000000000',
  totalMessageFees: '0',
  rotationsPerRound: '1'
}
    Deployer key check: Configured in environment
[✓] Dry run completed. Ready for deployment.
```

### Step 3: Run Deployment with Funded Wallet
Run deployment using the keystore manager or TypeScript deployment script:

```bash
python scripts/deployer_keystore.py deploy
```

---

## Historical Deployment Reference (Archive)
The following past deployments are archived and replaced by the active contract (`0x7Cef756668Cd925807e8B110D0330643c6F809E3`):
- **Historical Devnet 2**: `0xF52d9FD2a1542b3F84417a916f3aB4B4631D0b3D` ([Explorer](https://explorer-studio-dev.genlayer.com/address/0xF52d9FD2a1542b3F84417a916f3aB4B4631D0b3D))
- **Historical Devnet 1**: `0x53EAd6deB8103B278e663Bc9808926FB7B308a63` ([Explorer](https://explorer-studio-dev.genlayer.com/address/0x53EAd6deB8103B278e663Bc9808926FB7B308a63))
- **Historical Devnet 1 Tx**: `0xe193586d4939aaf247788ee3526dda5e2d403eb5ca482606b4dbe954d3d5a355`
