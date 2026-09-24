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

  console.log("Deploying contract...");
  try {
      const tx = await client.deployContract({
        code: contractCode,
        args: [],
        fees: {
            distribution: {
                leaderTimeunitsAllocation: 10000n,
                validatorTimeunitsAllocation: 10000n,
                rotations: [10000n], // non default!
            }
        }
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
