import { createRequire } from "node:module";
import { resolve } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const { generatePrivateKey, privateKeyToAccount } = require(resolve(root, "web/node_modules/viem/accounts"));
const { createClient, createAccount } = require(resolve(root, "web/node_modules/genlayer-js/dist/index.js"));
const { studioDevnet } = require(resolve(root, "web/node_modules/genlayer-js/dist/chains/index.js"));
const keytar = require(resolve(homedir(), "AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar"));

const RPC_URL = "https://studio-dev.genlayer.com/api";
const DEPLOYER_ACCOUNT_NAME = "shiplock-deployer-live";
const FUNDER_ACCOUNT_NAME = "coverlock-submitter"; // 12.25 GEN available on Studio Next

async function main() {
  console.log("=== ShipLock Fresh Deployer Account Creation & Funding ===");

  // 1. Check if shiplock-deployer-live already exists in keytar
  let deployerPrivateKey = await keytar.getPassword("genlayer-cli", `account:${DEPLOYER_ACCOUNT_NAME}`);
  let isFresh = false;

  if (!deployerPrivateKey) {
    console.log("[*] Generating fresh deployer private key using cryptographic randomness...");
    deployerPrivateKey = generatePrivateKey();
    await keytar.setPassword("genlayer-cli", `account:${DEPLOYER_ACCOUNT_NAME}`, deployerPrivateKey);
    console.log(`[✓] Fresh account saved securely to OS keychain as '${DEPLOYER_ACCOUNT_NAME}'.`);
    isFresh = true;
  } else {
    console.log(`[*] Found existing keytar account '${DEPLOYER_ACCOUNT_NAME}'.`);
  }

  const deployerAccount = privateKeyToAccount(deployerPrivateKey);
  console.log(`[+] Deployer Public Address: ${deployerAccount.address}`);

  // 2. Query balance of deployer on Studio Next
  const publicClient = createClient({
    chain: studioDevnet,
    endpoint: RPC_URL,
  });

  let balanceWei = await publicClient.getBalance({ address: deployerAccount.address });
  let balanceGen = Number(balanceWei) / 1e18;
  console.log(`[+] Deployer Balance: ${balanceGen.toFixed(4)} GEN (${balanceWei} wei)`);

  // 3. Fund deployer if balance < 2 GEN
  if (balanceWei < 2000000000000000000n) {
    console.log(`[*] Funding deployer from safe account '${FUNDER_ACCOUNT_NAME}'...`);
    const funderSecret = await keytar.getPassword("genlayer-cli", `account:${FUNDER_ACCOUNT_NAME}`);
    if (!funderSecret) {
      throw new Error(`Funder account '${FUNDER_ACCOUNT_NAME}' not found in keytar.`);
    }

    const funderAccount = createAccount(funderSecret);
    const funderClient = createClient({
      chain: studioDevnet,
      endpoint: RPC_URL,
      account: funderAccount,
    });

    const fundAmountWei = 3000000000000000000n; // 3.0 GEN
    console.log(`[*] Sending 3.0 GEN from ${funderAccount.address} to ${deployerAccount.address}...`);

    const txHash = await funderClient.sendTransaction({
      to: deployerAccount.address,
      value: fundAmountWei,
    });
    console.log(`[*] Funding transaction submitted: ${txHash}`);
    console.log("[*] Waiting for finalization...");

    await funderClient.waitForTransactionReceipt({
      hash: txHash,
      waitUntil: "finalized",
      retries: 100,
      interval: 3000,
    });
    console.log("[✓] Funding transaction finalized!");

    balanceWei = await publicClient.getBalance({ address: deployerAccount.address });
    balanceGen = Number(balanceWei) / 1e18;
    console.log(`[✓] Confirmed Deployer Balance: ${balanceGen.toFixed(4)} GEN (${balanceWei} wei)`);
  }

  console.log("\nDeployer wallet ready for deployment.");
}

main().catch((err) => {
  console.error("[-] Error:", err.message || err);
  process.exit(1);
});
