import { createClient } from "genlayer-js";

import fs from "fs";

async function main() {
  const client = createClient({
    chain: {
        id: 61997,
        name: "studio-dev",
        endpoint: "https://studio-dev.genlayer.com/api"
    },
    account: "0x069feb519b143056943a8e103e8586f39c0584aa6028d6c5cc2f02d2d7d582be"
  });

  const contractCode = fs.readFileSync("../contracts/shiplock.py", "utf-8");

  console.log("Deploying contract...");
  try {
      const tx = await client.deployContract({
        code: contractCode,
        args: [],
        fees: { feeValue: "1000000000000000000" } // 1 GEN
      });
      console.log("Tx hash:", tx.hash);
      
      const receipt = await client.waitForReceipt({ hash: tx.hash });
      console.log("Receipt:", receipt);
      console.log("Contract Address:", receipt.contractAddress);
  } catch(e) {
      console.error(e);
  }
}
main();
