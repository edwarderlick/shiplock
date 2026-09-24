import { createClient, encodeInternalMessageFeeParams } from "genlayer-js";
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
                leaderTimeunitsAllocation: 100000n,
                validatorTimeunitsAllocation: 100000n,
                rotations: [100000n],
                totalMessageFees: 1000000n,
            },
            messageAllocations: [
                {
                    messageType: 1, // LOCAL_WRITE
                    onAcceptance: true,
                    parentIndex: 0n,
                    recipient: "0x0000000000000000000000000000000000000000",
                    callKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
                    budget: 1000000n, // THIS MIGHT BE CALLED BUDGET IN GENLAYER-JS
                    feeParams: encodeInternalMessageFeeParams({
                        leaderTimeunitsAllocation: 100000n,
                        validatorTimeunitsAllocation: 100000n,
                        executionBudgetPerRound: 1000000n
                    })
                }
            ],
            feeValue: 2000000n // Ensure feeValue is present and non-zero
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
