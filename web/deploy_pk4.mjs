import { createClient, encodeInternalMessageFeeParams } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, encodeFunctionData, createPublicClient } from "viem";
import fs from "fs";

async function main() {
  const account = privateKeyToAccount("0x069feb519b143056943a8e103e8586f39c0584aa6028d6c5cc2f02d2d7d582be");
  
  const publicClient = createPublicClient({
      chain: studioDevnet,
      transport: http("https://studio-dev.genlayer.com/api")
  });
  
  const contractCode = fs.readFileSync("../contracts/shiplock.py", "utf-8");

  const ADD_TRANSACTION_ABI = [
    {
      name: "addTransaction",
      type: "function",
      stateMutability: "payable",
      inputs: [
        {
          name: "params",
          type: "tuple",
          components: [
            { name: "sender", type: "address" },
            { name: "recipient", type: "address" },
            { name: "numOfInitialValidators", type: "uint256" },
            { name: "maxRotations", type: "uint256" },
            { name: "validUntil", type: "uint256" },
            { name: "saltNonce", type: "uint256" },
            { name: "userValue", type: "uint256" },
            {
              name: "feesDistribution",
              type: "tuple",
              components: [
                { name: "leaderTimeunitsAllocation", type: "uint256" },
                { name: "validatorTimeunitsAllocation", type: "uint256" },
                { name: "rotations", type: "uint256[]" },
                { name: "totalMessageFees", type: "uint256" },
                {
                  name: "messageAllocations",
                  type: "tuple[]",
                  components: [
                    { name: "messageType", type: "uint8" },
                    { name: "onAcceptance", type: "bool" },
                    { name: "parentIndex", type: "uint256" },
                    { name: "recipient", type: "address" },
                    { name: "callKey", type: "bytes32" },
                    { name: "budget", type: "uint256" },
                    { name: "feeParams", type: "bytes" }
                  ]
                }
              ]
            },
            { name: "txCalldata", type: "bytes" }
          ]
        }
      ]
    }
  ];

  let txCalldata = Buffer.from(contractCode).toString("hex");
  if (!txCalldata.startsWith("0x")) {
      txCalldata = "0x" + txCalldata;
  }

  const params = {
    sender: account.address,
    recipient: "0x0000000000000000000000000000000000000000",
    numOfInitialValidators: 3n,
    maxRotations: 3n,
    validUntil: BigInt(Date.now() + 600000), // 10 minutes
    saltNonce: BigInt(Math.floor(Math.random() * 100000000)),
    userValue: 0n,
    feesDistribution: {
        leaderTimeunitsAllocation: 100000000n,
        validatorTimeunitsAllocation: 100000000n,
        rotations: [0n],
        totalMessageFees: 1000000000000000000n,
        messageAllocations: [
            {
                messageType: 1, // LOCAL_WRITE
                onAcceptance: true,
                parentIndex: 0n,
                recipient: "0x0000000000000000000000000000000000000000",
                callKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
                budget: 1000000000000000000n,
                feeParams: encodeInternalMessageFeeParams({
                    leaderTimeunitsAllocation: 100000n,
                    validatorTimeunitsAllocation: 100000n,
                    executionBudgetPerRound: 10000000000n
                })
            }
        ]
    },
    txCalldata
  };

  console.log("Simulating contract call...");
  try {
      const { request } = await publicClient.simulateContract({
          account,
          address: studioDevnet.consensusMainContract.address,
          abi: ADD_TRANSACTION_ABI,
          functionName: "addTransaction",
          args: [params],
          value: 1000000000000000000n
      });
      console.log("Simulation successful");
  } catch(e) {
      console.error("Simulation failed:", e);
  }
}
main();
