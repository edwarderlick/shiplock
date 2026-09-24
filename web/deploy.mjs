import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import fs from "fs";

async function main() {
  const keystoreData = JSON.parse(fs.readFileSync("../keystore.json", "utf-8"));
  
  const client = createClient({
    chain: studioDevnet,
    account: {
        keystore: { ...keystoreData, address: '0x' + keystoreData.address },
        password: "12345678"
    }
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
