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
  
  const walletClient = createWalletClient({
      account,
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

  const params = {
    sender: account.address,
    recipient: "0x0000000000000000000000000000000000000000",
    numOfInitialValidators: 1n,
    maxRotations: 0n,
    validUntil: BigInt(Date.now() + 600000), // 10 minutes
    saltNonce: 0n,
    userValue: 0n,
    feesDistribution: {
        leaderTimeunitsAllocation: 0n,
        validatorTimeunitsAllocation: 0n,
        rotations: [],
        totalMessageFees: 1000000000000000000n,
        messageAllocations: [
            {
                messageType: 1, // LOCAL_WRITE
                onAcceptance: true,
                parentIndex: 0n,
                recipient: "0x0000000000000000000000000000000000000000",
                callKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
                budget: 1000000000000000000n, // feeValue?
                feeParams: encodeInternalMessageFeeParams({
                    leaderTimeunitsAllocation: 100000n,
                    validatorTimeunitsAllocation: 100000n
                })
            }
        ]
    },
    txCalldata: Buffer.from(contractCode).toString("hex")
  };
  
  // ensure txCalldata is 0x prefixed
  if (!params.txCalldata.startsWith("0x")) {
      params.txCalldata = "0x" + params.txCalldata;
  }

  const encodedData = encodeFunctionData({
    abi: ADD_TRANSACTION_ABI,
    functionName: "addTransaction",
    args: [params]
  });

  console.log("Deploying contract directly using viem...");
  try {
      const { request } = await publicClient.simulateContract({ address: studioDevnet.consensusMainContract.address, abi: ADD_TRANSACTION_ABI, functionName: "addTransaction", args: [params], value: 1000000000000000000n, account }); const txHash = await walletClient.writeContract(request); //
          to: studioDevnet.consensusMainContract.address,
          data: encodedData,
          value: 1000000000000000000n, // msg.value must >= totalMessageFees
          gas: 5000000n
      });
      console.log("Tx hash:", txHash);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Receipt status:", receipt.status);
      console.log("Logs:", receipt.logs);
  } catch(e) {
      console.error(e);
  }
}
main();
