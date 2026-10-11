import { createRequire } from "node:module";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { writeFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const keytar = require(resolve(homedir(), "AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar"));

async function syncKeystore() {
  const ksPath = resolve(root, ".deployer_keystore.json");
  if (existsSync(ksPath)) {
    console.log(".deployer_keystore.json already exists");
    return;
  }
  const pk = await keytar.getPassword("genlayer-cli", "account:shiplock-deployer-live");
  if (!pk) throw new Error("No deployer pk in keytar");

  const ksPwd = crypto.randomBytes(32).toString("hex");
  await keytar.setPassword("genlayer-cli", "keystore_password:shiplock-deployer-live", ksPwd);

  const pyCode = `
import json, sys
from eth_account import Account
pk = sys.argv[1]
pwd = sys.argv[2]
ks = Account.encrypt(pk, pwd)
with open(".deployer_keystore.json", "w", encoding="utf-8") as f:
    json.dump(ks, f, indent=2)
`;

  execFileSync("python", ["-c", pyCode, pk, ksPwd], { cwd: root, stdio: "inherit" });
  console.log("[✓] Successfully wrote .deployer_keystore.json with fresh key!");
}

syncKeystore().catch((err) => {
  console.error("[-] Error:", err);
  process.exit(1);
});
