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
  { name: "PyPI 404 Escrow", id: "0x1ac2eea7c83967a0abe667355598d3809fb2552cc5d4227ad7ba86fee09a3c46", expectedStatus: "OPEN", expectedAmount: 20000000000000000n, testReleaseFees: true },
  { name: "npm 404 Escrow", id: "0x6a335be143b6b8fc255392c764b2cca019ce81ea413dcf6ba88f312ada0bf40e", expectedStatus: "OPEN", expectedAmount: 20000000000000000n, testReleaseFees: true },
  { name: "PyPI Candidate Release", id: "0xdc2dfac88f9a7dbc2615c3a2338cd12819efca660352c1d1c8b6f530ed5f9c1a", expectedStatus: "OPEN", expectedAmount: 10000000000000000n, testReleaseFees: true },
  { name: "npm Candidate Release", id: "0x3c46e617d6541f63e69f783c0a481f429bb9c7e08509274ebbef25fc1b8444ad", expectedStatus: "OPEN", expectedAmount: 10000000000000000n, testReleaseFees: true },
  { name: "Live Funding Proof Escrow", id: "0x632b64ce06e117d2dc11da291e031f82844fa29d25e841b95f4f33734b30270c", expectedStatus: "OPEN", expectedAmount: 10000000000000000n, testReleaseFees: true },
  { name: "Manual 2 GEN Escrow", id: "0x7f24e638ea5ed353c377f968352fdf9d2e1c66959fa739fa69d1d32e54d58d53", expectedStatus: "OPEN", expectedAmount: 2000000000000000000n, testReleaseFees: true },
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
  if (!economics || economics.escrowed_open === undefined) {
    throw new Error("Failed to read contract economics or escrowed_open is undefined");
  }
  console.log("Economics:", {
    total_escrowed: economics.total_escrowed?.toString(),
    escrowed_open: economics.escrowed_open?.toString(),
    total_payout: economics.total_payout?.toString(),
    paid_to_recipients: economics.paid_to_recipients?.toString(),
    total_refunded: economics.total_refunded?.toString(),
    refunded_to_funders: economics.refunded_to_funders?.toString(),
  });

  // Verify total locked is at least 2.07 GEN (2070000000000000000n)
  const escrowedOpenWei = BigInt(economics.escrowed_open.toString());
  if (escrowedOpenWei < 2070000000000000000n) {
    throw new Error(`Economics mismatch: escrowed_open (${escrowedOpenWei}) is less than expected 2.07 GEN`);
  }

  // 2. Query each escrow
  console.log("\n--- 2. Escrows Preflight Status & Fee Estimation ---");
  for (const item of ESCROWS_TO_CHECK) {
    console.log(`\nChecking ${item.name} (${item.id})...`);
    let esc = null;
    try {
      esc = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_escrow",
        args: [item.id],
      });
    } catch (readErr) {
      throw new Error(`Failed to read escrow ${item.name} (${item.id}): ${readErr.message || readErr}`);
    }

    if (!esc || !esc.status) {
      throw new Error(`Escrow ${item.name} (${item.id}) returned empty or invalid data`);
    }

    const principalWei = BigInt((esc.principal_wei || esc.amount || 0n).toString());
    console.log(`  Status: ${esc.status}, match_reason: ${esc.match_reason}, principal: ${principalWei.toString()} wei`);
    console.log(`  Funder: ${esc.funder}, Recipient: ${esc.recipient}`);

    if (item.expectedStatus && esc.status !== item.expectedStatus) {
      throw new Error(`Escrow ${item.name} status mismatch: expected ${item.expectedStatus}, got ${esc.status}`);
    }
    if (item.expectedAmount && principalWei !== item.expectedAmount) {
      throw new Error(`Escrow ${item.name} principal mismatch: expected ${item.expectedAmount.toString()}, got ${principalWei.toString()}`);
    }

    // 3. Test allocation construction and authoritative fee estimation
    if (item.testReleaseFees) {
      console.log(`  Testing allocation construction and authoritative fee estimation for release...`);
      const completeAllocs = buildReleaseMessageAllocations({
        recipient: esc.recipient,
        funder: esc.funder,
      });

      if (!completeAllocs || completeAllocs.length < 1) {
        throw new Error(`Failed to construct message allocations for ${item.name}`);
      }

      const expectedRoots = esc.recipient.toLowerCase() === esc.funder.toLowerCase() ? 1 : 2;
      if (completeAllocs.length !== expectedRoots) {
        throw new Error(`Allocation count mismatch for ${item.name}: expected ${expectedRoots}, got ${completeAllocs.length}`);
      }

      let authFees = null;
      try {
        authFees = await client.estimateTransactionFees({
          leaderTimeunitsAllocation: 200n,
          validatorTimeunitsAllocation: 400n,
          rotations: [1n],
          messageAllocations: completeAllocs,
        });
      } catch (authErr) {
        throw new Error(`Authoritative fee estimation failed for ${item.name}: ${authErr.message || authErr}`);
      }

      if (!authFees || !authFees.distribution) {
        throw new Error(`Fee estimation returned empty distribution for ${item.name}`);
      }

      // Validate allocations
      validateTransferAllocations({
        functionName: "release",
        distribution: authFees.distribution,
        messageAllocations: authFees.messageAllocations,
        mustHaveTransfer: true,
        expectedRecipients: esc.recipient.toLowerCase() === esc.funder.toLowerCase() ? [esc.recipient] : [esc.recipient, esc.funder],
      });

      console.log(`  ✓ Authoritative fees validated: totalMessageFees=${authFees.distribution.totalMessageFees}, feeValue=${authFees.feeValue}`);
    }
  }

  console.log("\n=======================================================");
  console.log("✓ Preflight check succeeded for all 6 escrows.");
  console.log("✓ All escrow reads, allocation builds, and fee validations passed.");
  console.log("✓ No live transactions were submitted (read-only verification).");
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("\n❌ PREFLIGHT CHECK FAILED:", err.message || err);
  process.exit(1);
});
