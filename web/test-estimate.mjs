import { createClient } from "genlayer-js";
const client = createClient("https://studio-dev.genlayer.com/api");
const contract = "0x53EAd6deB8103B278e663Bc9808926FB7B308a63";

async function run() {
  const call1 = {
    address: contract,
    functionName: "lockEscrow",
    args: ["0x0", "0x0000000000000000000000000000000000000000", 0n]
  };
  try {
    console.log("Estimating lockEscrow...");
    await client.estimateTransactionFeesForWrite(call1);
  } catch (err) {
    console.log("lockEscrow error:", err.message, err.data, err.cause);
  }
  
  const call2 = {
    address: contract,
    functionName: "fund_escrow",
    args: [
      "PYPI_VERSION",
      "shiplock-smoke-does-not-exist",
      "1.0.0",
      "0x0000000000000000000000000000000000000000",
      "2026-09-24T17:57:42Z",
      "2026-09-26T17:57:42Z"
    ],
    value: 2000000000000000000n
  };
  console.log("\nCall object:", JSON.stringify(call2, (key, value) => typeof value === 'bigint' ? value.toString() : value));
  try {
    console.log("Estimating fund_escrow...");
    await client.estimateTransactionFeesForWrite(call2);
    console.log("Success!");
  } catch (err) {
    console.log("fund_escrow error:", err.message, err.data, err.cause);
  }
}
run();
