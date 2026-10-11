import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const { createClient, createAccount } = require(resolve(root, "web/node_modules/genlayer-js/dist/index.js"));
const { studioDevnet } = require(resolve(root, "web/node_modules/genlayer-js/dist/chains/index.js"));
const { getAddress } = require(resolve(root, "web/node_modules/viem"));
const keytar = require(resolve(homedir(), "AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar"));

const RPC_URL = "https://studio-dev.genlayer.com/api";
const CHAIN_ID = 61997;
const ACCOUNT_NAME = "shiplock-deployer-live";

async function main() {
  console.log("=== ShipLock Studio Next Live Contract Deployment ===");
  console.log(`Target Network : ${studioDevnet.name} (Chain ID: ${studioDevnet.id})`);
  console.log(`Canonical RPC  : ${RPC_URL}`);

  if (studioDevnet.id !== CHAIN_ID) {
    throw new Error(`Chain ID mismatch: expected ${CHAIN_ID}, got ${studioDevnet.id}`);
  }

  // 1. Load deployer account from secure keytar store
  const secret = await keytar.getPassword("genlayer-cli", `account:${ACCOUNT_NAME}`);
  if (!secret) {
    throw new Error(`Account '${ACCOUNT_NAME}' not found in secure OS keychain.`);
  }

  const account = createAccount(secret);
  console.log(`[+] Deployer Public Address: ${account.address}`);

  const client = createClient({
    chain: studioDevnet,
    endpoint: RPC_URL,
    account,
  });

  const balance = await client.getBalance({ address: account.address });
  const balanceGen = Number(balance) / 1e18;
  console.log(`[+] Deployer Balance: ${balanceGen.toFixed(4)} GEN (${balance} wei)`);

  // 2. Read and hash contract source code
  const contractPath = resolve(root, "contracts/shiplock.py");
  const contractCode = readFileSync(contractPath, "utf-8").replace(/\r\n/g, "\n");
  const localSourceHash = createHash("sha256").update(contractCode, "utf8").digest("hex");
  console.log(`[+] Contract File: contracts/shiplock.py (${contractCode.length} bytes)`);
  console.log(`[+] Local Source SHA-256: ${localSourceHash}`);

  // 3. Existing verified transaction hash
  const deployTxHash = "0x3f7e83337967b194e40fea35a4f8abea7f99a05890a422d2d89096052e2a5854";
  console.log(`\n============================================================`);
  console.log(`[VERIFIED] Deployment Transaction Hash: ${deployTxHash}`);
  console.log(`============================================================\n`);

  // 4. Look up transaction and verify execution
  console.log(`[*] Fetching transaction receipt for ${deployTxHash}...`);
  const tx = await client.getTransaction({ hash: deployTxHash });
  const statusName = tx.statusName ?? tx.status;
  const execResult = tx.txExecutionResultName ?? tx.executionResultName ?? tx.txExecutionResult;
  const rawAddress = tx.data?.contract_address ?? tx.txDataDecoded?.contractAddress ?? tx.contract_address ?? tx.contractAddress;
  const contractAddress = getAddress(rawAddress);

  console.log(`[+] Transaction Status: ${statusName}`);
  console.log(`[+] Execution Result  : ${execResult}`);
  console.log(`[+] Contract Address  : ${contractAddress}`);

  if (statusName !== "FINALIZED") {
    throw new Error(`Deployment transaction is not FINALIZED (status=${statusName}).`);
  }
  if (execResult !== "FINISHED_WITH_RETURN" && execResult !== 0) {
    throw new Error(`Deployment transaction did not execute successfully (executionResult=${execResult}).`);
  }

  // 5. Read back on-chain code and verify SHA-256 source hash
  console.log(`[*] Reading back on-chain contract code from ${contractAddress}...`);
  const onChainCode = await client.getContractCode(contractAddress);
  if (!onChainCode || onChainCode.length === 0) {
    throw new Error(`Failed to read back on-chain contract code from ${contractAddress}`);
  }

  const normalizedOnChain = onChainCode.replace(/\r\n/g, "\n");
  const onChainSourceHash = createHash("sha256").update(normalizedOnChain, "utf8").digest("hex");
  console.log(`[+] On-Chain Code Length: ${normalizedOnChain.length} bytes`);
  console.log(`[+] On-Chain Source SHA-256: ${onChainSourceHash}`);

  const hashesMatch = localSourceHash === onChainSourceHash;
  console.log(`[+] Source Hash Parity: ${hashesMatch ? "MATCH (100% IDENTICAL)" : "MISMATCH"}`);
  if (!hashesMatch) {
    throw new Error(`Source hash mismatch: local ${localSourceHash} vs on-chain ${onChainSourceHash}`);
  }

  // 6. Update environment files
  const envContent = [
    `NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`,
    `GENLAYER_CONTRACT_ADDRESS=${contractAddress}`,
    `NEXT_PUBLIC_STUDIO_RPC_URL=${RPC_URL}`,
    `NEXT_PUBLIC_GENLAYER_RPC_URL=${RPC_URL}`,
    `NEXT_PUBLIC_GENLAYER_CHAIN_ID=${CHAIN_ID}`,
    `GENLAYER_RPC_URL=${RPC_URL}`,
    `DEPLOYER_ADDRESS=${account.address}`,
  ].join("\n") + "\n";

  writeFileSync(resolve(root, ".env.local"), envContent);
  writeFileSync(resolve(root, "web/.env.local"), envContent);
  console.log("[✓] Updated .env.local and web/.env.local with deployed contract address.");

  // 7. Save deployment manifest
  const manifest = {
    network: "Studio Next",
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
    deployerAddress: account.address,
    transactionHash: deployTxHash,
    contractAddress: contractAddress,
    explorerTxUrl: `https://explorer-studio-dev.genlayer.com/tx/${deployTxHash}`,
    explorerContractUrl: `https://explorer-studio-dev.genlayer.com/address/${contractAddress}`,
    localSourceHash,
    onChainSourceHash,
    sourceVerified: hashesMatch,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(resolve(root, "scripts/latest_deployment.json"), JSON.stringify(manifest, null, 2));

  console.log("\n============================================================");
  console.log("SHIPLOCK DEPLOYMENT COMPLETE & VERIFIED");
  console.log(`Deployer Address : ${manifest.deployerAddress}`);
  console.log(`Transaction Hash : ${manifest.transactionHash}`);
  console.log(`Contract Address : ${manifest.contractAddress}`);
  console.log(`Explorer Link    : ${manifest.explorerContractUrl}`);
  console.log(`Source SHA-256   : ${manifest.localSourceHash}`);
  console.log(`Source Match     : ${manifest.sourceVerified}`);
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("[-] Deployment failed:", err.message || err);
  process.exit(1);
});
