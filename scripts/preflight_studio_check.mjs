import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  buildReleaseMessageAllocations,
  validateTransferAllocations,
} from "./evidence_helper.mjs";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const { createClient } = require(resolve(root, "web/node_modules/genlayer-js/dist/index.js"));
const { studioDevnet } = require(resolve(root, "web/node_modules/genlayer-js/dist/chains/index.js"));

const CONTRACT_ADDRESS = "0x7Cef756668Cd925807e8B110D0330643c6F809E3";
const RPC_URL = process.env.GENLAYER_RPC_URL || "https://studio-dev.genlayer.com/api";

const ESCROWS_TO_CHECK = [
  { name: "PyPI 404 Escrow", id: "0x1ac2eea7c83967a0abe667355598d3809fb2552cc5d4227ad7ba86fee09a3c46" },
  { name: "npm 404 Escrow", id: "0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e" },
  { name: "PyPI Candidate Release", id: "0xdc2dfac88f9a7dbc2615c3a2338cd12819efca660352c1d1c8b6f530ed5f9c1a" },
  { name: "npm Candidate Release", id: "0x3c46e617d6541f63e69f783c0a481f429bb9c7e08509274ebbef25fc1b8444ad" },
  { name: "Live Funding Proof Escrow", id: "0x632b64ce06e117d2dc11da291e031f82844fa29d25e841b95f4f33734b30270c" },
];

async function main() {
  console.log(`Connecting to Studio Next RPC: ${RPC_URL}`);
  console.log(`Active Contract: ${CONTRACT_ADDRESS}`);

  const client = createClient({
    chain: studioDevnet,
    endpoint: RPC_URL,
  });

  // 1. Query economics
  console.log("\n--- 1. Contract Economics Query ---");
  const economics = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_economics",
    args: [],
  });
  console.log("Economics:", {
    total_escrowed: economics.total_escrowed?.toString(),
    escrowed_open: economics.escrowed_open?.toString(),
    total_payout: economics.total_payout?.toString(),
    paid_to_recipients: economics.paid_to_recipients?.toString(),
    total_refunded: economics.total_refunded?.toString(),
    refunded_to_funders: economics.refunded_to_funders?.toString(),
  });

  // 2. Query each escrow
  console.log("\n--- 2. Escrows Preflight Status ---");
  for (const item of ESCROWS_TO_CHECK) {
    const esc = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [item.id],
    });
    console.log(`\nEscrow: ${item.name} (${item.id}):`);
    console.log({
      status: esc.status,
      match_reason: esc.match_reason,
      funder: esc.funder,
      recipient: esc.recipient,
      principal_wei: esc.principal_wei?.toString() || esc.amount?.toString(),
      payout_recipient: esc.payout_recipient?.toString() || esc.payout?.toString(),
      refund_funder: esc.refund_funder?.toString() || esc.refund?.toString(),
      window_start: esc.window_start,
      window_end: esc.window_end,
    });

    // 3. Test read-only simulation & authoritative fee estimation with complete allocations
    if (item.name.includes("404")) {
      console.log(`\nTesting read-only preflight fee estimation for ${item.name}...`);
      
      // A. Studio Next raw simulation for release(id)
      try {
        if (typeof client.estimateTransactionFeesForWrite === "function") {
          const rawSim = await client.estimateTransactionFeesForWrite({
            address: CONTRACT_ADDRESS,
            functionName: "release",
            args: [item.id],
            leaderTimeunitsAllocation: 200n,
            validatorTimeunitsAllocation: 400n,
            rotations: [1n],
          });
          console.log(`  Studio Next simulation raw messageAllocations length: ${rawSim.messageAllocations?.length ?? 0}`);
          console.log(`  Raw simulation totalMessageFees: ${rawSim.distribution?.totalMessageFees?.toString()}`);
        } else {
          console.log("  client.estimateTransactionFeesForWrite not present on client");
        }
      } catch (simErr) {
        console.log(`  Raw simulation notice: ${simErr.message}`);
      }

      // B. Complete allocations construction and authoritative estimation
      const completeAllocs = buildReleaseMessageAllocations({
        recipient: esc.recipient,
        funder: esc.funder,
      });
      console.log(`  Constructed complete allocations: ${completeAllocs.length} root nodes (recipient: ${completeAllocs[0].recipient}, funder: ${completeAllocs[1]?.recipient})`);

      try {
        const authFees = await client.estimateTransactionFees({
          leaderTimeunitsAllocation: 200n,
          validatorTimeunitsAllocation: 400n,
          rotations: [1n],
          messageAllocations: completeAllocs,
        });
        console.log("  Authoritative estimateTransactionFees result:", {
          leaderTimeunitsAllocation: authFees.distribution.leaderTimeunitsAllocation?.toString(),
          validatorTimeunitsAllocation: authFees.distribution.validatorTimeunitsAllocation?.toString(),
          totalMessageFees: authFees.distribution.totalMessageFees?.toString(),
          feeValue: authFees.feeValue?.toString(),
          allocationsCount: authFees.messageAllocations?.length,
        });

        validateTransferAllocations({
          functionName: "release",
          distribution: authFees.distribution,
          messageAllocations: authFees.messageAllocations,
          mustHaveTransfer: true,
          expectedRecipients: [esc.recipient, esc.funder],
        });
        console.log("  Authoritative complete allocation fee configuration validated successfully!");
      } catch (authErr) {
        console.error("  Authoritative fee estimation failed:", authErr.message);
      }
    }
  }

  console.log("\nPreflight check complete. No live transactions submitted.");
}

main().catch((err) => {
  console.error("Preflight check error:", err);
  process.exit(1);
});
