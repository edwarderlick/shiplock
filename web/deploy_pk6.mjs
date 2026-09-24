import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";

async function main() {
  const account = privateKeyToAccount("0x069feb519b143056943a8e103e8586f39c0584aa6028d6c5cc2f02d2d7d582be");
  const client = createClient({
    chain: studioDevnet,
    account: account
  });

  const contractCode = fs.readFileSync("../contracts/shiplock.py", "utf-8");

  console.log("Estimating fees...");
  try {
      const estimatedDistribution = await client.estimateFeesDistribution({
          messageAllocations: []
      });
      console.log("Estimated Distribution:", estimatedDistribution);

      console.log("Deploying contract...");
      const txHash = await client.deployContract({
        code: contractCode,
        args: [],
        fees: {
            distribution: estimatedDistribution
        }
      });
      console.log("txHash:", txHash);
      
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      console.log("Receipt:", receipt);
      console.log("Contract Address:", receipt.contractAddress);
  } catch(e) {
      console.error(e);
  }
}
main();
