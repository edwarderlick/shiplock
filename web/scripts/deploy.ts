import fs from "node:fs";
import path from "node:path";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { deployShipLockContract } from "../src/lib/deploy";
import feeProfile from "../src/fee-profile.json";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun =
    args.includes("--dry-run") ||
    process.argv.includes("--dry-run") ||
    process.env.npm_config_dry_run === "true" ||
    process.env.npm_config_dry_run === "1" ||
    process.env.DRY_RUN === "true";

  console.log("=== ShipLock Studio Next Contract Deployer ===");
  console.log(`Chain: ${studioDevnet.name} (Chain ID: ${studioDevnet.id})`);
  console.log(`RPC: ${studioDevnet.rpcUrls.default.http[0]}`);

  // Load contract source
  const contractPath = path.resolve(__dirname, "../../contracts/shiplock.py");
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract file not found at ${contractPath}`);
  }
  const contractCode = fs.readFileSync(contractPath, "utf-8");

  // Secure secret retrieval: only environment variable, never keystore.json or historical test keys
  const privateKey = (process.env.DEPLOYER_PRIVATE_KEY || process.env.GENLAYER_PRIVATE_KEY || "").trim();

  if (!privateKey && !isDryRun) {
    console.error("\n[-] ERROR: No deployer private key provided.");
    console.error("    Security policy: Never defaults to keystore.json or historical test keys.");
    console.error("    Please create a fresh wallet in your wallet application (e.g. MetaMask, Rabby),");
    console.error("    fund it with test GEN on GenLayer Studio Next, and export its private key securely:");
    console.error("      PowerShell : $env:DEPLOYER_PRIVATE_KEY=\"0x<key>\"");
    console.error("      Bash/POSIX : export DEPLOYER_PRIVATE_KEY=\"0x<key>\"");
    console.error("    Never display, log, or commit your private key to Git.\n");
    process.exit(1);
  }

  if (isDryRun) {
    console.log("\n[+] Dry-run validation:");
    console.log(`    Contract size: ${contractCode.length} bytes`);
    console.log("    Fee profile loaded: deploy =", feeProfile.deploy);
    console.log("    Deployer key check:", privateKey ? "Configured in environment" : "Not set (dry-run mode)");
    console.log("[✓] Dry run completed. Ready for deployment.");
    return;
  }

  const cleanKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(cleanKey);
  console.log(`[+] Deployer address: ${account.address}`);

  const client = createClient({
    chain: studioDevnet,
    account,
  });

  // Check if lookup-tx was requested
  const lookupIndex = args.indexOf("--lookup-tx");
  if (lookupIndex !== -1 && args[lookupIndex + 1]) {
    const existingTxHash = args[lookupIndex + 1] as `0x${string}`;
    console.log(`[*] Looking up existing deployment transaction: ${existingTxHash}...`);
    const receipt = await client.waitForTransactionReceipt({
      hash: existingTxHash as any,
      waitUntil: "finalized",
    });
    const { isDeploymentExecutionSuccessful, extractContractAddress } = await import("../src/lib/deploy");
    if (!isDeploymentExecutionSuccessful(client, receipt)) {
      throw new Error(`Transaction ${existingTxHash} did not execute successfully.`);
    }
    const contractAddress = extractContractAddress(receipt);
    console.log(`[✓] Finalized with return! Contract address: ${contractAddress}`);
    const onChainCode = await client.getContractCode(contractAddress);
    console.log(`[✓] On-chain code verified: ${onChainCode.length} bytes.`);
    console.log("\n============================================================");
    console.log("SHIPLOCK DEPLOYMENT VERIFIED");
    console.log(`Deployer Address : ${account.address}`);
    console.log(`Chain ID         : ${studioDevnet.id} (${studioDevnet.name})`);
    console.log(`Transaction Hash : ${existingTxHash}`);
    console.log(`Contract Address : ${contractAddress}`);
    console.log(`Explorer Link    : https://explorer-studio-dev.genlayer.com/address/${contractAddress}`);
    console.log(`Code Read Status : VERIFIED (${onChainCode.length} bytes)`);
    console.log("============================================================\n");
    return;
  }

  console.log("[*] Estimating fees using web/src/fee-profile.json...");
  const result = await deployShipLockContract({
    client,
    contractCode,
    feeProfile: feeProfile.deploy,
    onProgress: (stage, data) => {
      if (stage === "ESTIMATING_FEES") console.log("[*] Requesting fee quote...");
      if (stage === "SUBMITTING_DEPLOYMENT") {
        console.log(`[*] Submitting deployment transaction (feeValue: ${data.feeValue} wei)...`);
      }
      if (stage === "WAITING_FINALIZATION") {
        console.log(`[*] Transaction submitted: ${data.txHash}. Waiting for finalization...`);
      }
      if (stage === "DEPLOYMENT_SUCCESS") {
        console.log(`[✓] Deployment confirmed! Address: ${data.contractAddress}`);
      }
    },
  });

  // Verify on-chain contract code
  console.log(`[*] Verifying on-chain contract code at ${result.contractAddress}...`);
  const onChainCode = await client.getContractCode(result.contractAddress);
  if (!onChainCode || onChainCode.length === 0) {
    throw new Error(`Failed to read on-chain contract code at ${result.contractAddress}`);
  }
  console.log(`[✓] On-chain code verified: ${onChainCode.length} bytes`);

  console.log("\n============================================================");
  console.log("SHIPLOCK DEPLOYMENT COMPLETE");
  console.log(`Deployer Address : ${account.address}`);
  console.log(`Chain ID         : ${studioDevnet.id} (${studioDevnet.name})`);
  console.log(`Transaction Hash : ${result.txHash}`);
  console.log(`Contract Address : ${result.contractAddress}`);
  console.log(`Explorer Link    : https://explorer-studio-dev.genlayer.com/address/${result.contractAddress}`);
  console.log(`Code Read Status : VERIFIED (${onChainCode.length} bytes)`);
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("[-] Deployment failed:", err.message || err);
  process.exit(1);
});
