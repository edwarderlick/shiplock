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

  // 2. Query each escrow and track dynamic stage-aware accounting totals
  console.log("\n--- 2. Escrows Preflight Status & Fee Estimation ---");
  let dynamicExpectedOpen = 0n;
  let dynamicExpectedPaid = 0n;
  let dynamicExpectedRefunded = 0n;

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
    const payoutWei = BigInt((esc.payout_recipient || esc.payout || 0n).toString());
    const refundWei = BigInt((esc.refund_funder || esc.refund || 0n).toString());

    console.log(`  Status: ${esc.status}, match_reason: ${esc.match_reason}, principal: ${principalWei.toString()} wei`);
    console.log(`  Funder: ${esc.funder}, Recipient: ${esc.recipient}`);

    // Verify principal matches expected allocation
    if (item.expectedAmount && principalWei !== item.expectedAmount) {
      throw new Error(`Escrow ${item.name} principal mismatch: expected ${item.expectedAmount.toString()}, got ${principalWei.toString()}`);
    }

    // Stage-aware status validation
    const VALID_LIFECYCLE_STATUSES = ["OPEN", "RELEASED", "REFUND_NOHIT", "CANCELED", "EXPIRED"];
    if (!VALID_LIFECYCLE_STATUSES.includes(esc.status)) {
      throw new Error(`Escrow ${item.name} has unrecognized status: ${esc.status}`);
    }

    if (esc.status === "OPEN") {
      dynamicExpectedOpen += principalWei;
      if (payoutWei !== 0n || refundWei !== 0n) {
        throw new Error(`Escrow ${item.name} is OPEN but has non-zero payout (${payoutWei}) or refund (${refundWei})`);
      }
    } else if (esc.status === "RELEASED") {
      dynamicExpectedPaid += principalWei;
      if (esc.match_reason !== "200_IN_WINDOW") {
        throw new Error(`Escrow ${item.name} is RELEASED but match_reason is '${esc.match_reason}' (expected 200_IN_WINDOW)`);
      }
      if (payoutWei !== principalWei) {
        throw new Error(`Escrow ${item.name} is RELEASED but payout (${payoutWei}) does not match principal (${principalWei})`);
      }
      console.log(`  ✓ Verified legitimate terminal RELEASED settlement state (payout: ${payoutWei} wei)`);
    } else if (esc.status === "REFUND_NOHIT") {
      dynamicExpectedRefunded += principalWei;
      if (refundWei !== principalWei) {
        throw new Error(`Escrow ${item.name} is REFUND_NOHIT but refund (${refundWei}) does not match principal (${principalWei})`);
      }
      if (payoutWei !== 0n) {
        throw new Error(`Escrow ${item.name} is REFUND_NOHIT but payout (${payoutWei}) is non-zero`);
      }
      console.log(`  ✓ Verified legitimate terminal REFUND_NOHIT settlement state (refund: ${refundWei} wei, match_reason: ${esc.match_reason})`);
    } else if (esc.status === "CANCELED") {
      dynamicExpectedRefunded += principalWei;
      // In contracts/shiplock.py:cancel, status and refund are updated, but match_reason is not overwritten
      if (refundWei !== principalWei) {
        throw new Error(`Escrow ${item.name} is CANCELED but refund (${refundWei}) does not match principal (${principalWei})`);
      }
      if (payoutWei !== 0n) {
        throw new Error(`Escrow ${item.name} is CANCELED but payout (${payoutWei}) is non-zero`);
      }
      console.log(`  ✓ Verified legitimate terminal CANCELED settlement state (refund: ${refundWei} wei, match_reason preserved: ${esc.match_reason})`);
    } else if (esc.status === "EXPIRED") {
      dynamicExpectedRefunded += principalWei;
      // In contracts/shiplock.py:expire, status and refund are updated, but match_reason is not overwritten
      if (refundWei !== principalWei) {
        throw new Error(`Escrow ${item.name} is EXPIRED but refund (${refundWei}) does not match principal (${principalWei})`);
      }
      if (payoutWei !== 0n) {
        throw new Error(`Escrow ${item.name} is EXPIRED but payout (${payoutWei}) is non-zero`);
      }
      console.log(`  ✓ Verified legitimate terminal EXPIRED settlement state (refund: ${refundWei} wei, match_reason preserved: ${esc.match_reason})`);
    }

    // 3. Test allocation construction and authoritative fee estimation for OPEN escrows
    if (esc.status === "OPEN" && item.testReleaseFees) {
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

  // Verify dynamic stage-aware economics invariants
  console.log("\n--- 3. Stage-Aware Economics Reconciliation ---");
  const escrowedOpenWei = BigInt(economics.escrowed_open.toString());
  const paidToRecipientsWei = BigInt(economics.paid_to_recipients.toString());
  const refundedToFundersWei = BigInt(economics.refunded_to_funders.toString());

  console.log(`  Contract escrowed_open:      ${escrowedOpenWei.toString()} wei (expected: ${dynamicExpectedOpen.toString()})`);
  console.log(`  Contract paid_to_recipients:  ${paidToRecipientsWei.toString()} wei (expected >= ${dynamicExpectedPaid.toString()})`);
  console.log(`  Contract refunded_to_funders: ${refundedToFundersWei.toString()} wei (expected >= ${dynamicExpectedRefunded.toString()})`);

  if (escrowedOpenWei !== dynamicExpectedOpen) {
    throw new Error(
      `Economics mismatch: contract escrowed_open (${escrowedOpenWei}) does not match sum of currently OPEN escrows (${dynamicExpectedOpen})`
    );
  }
  if (paidToRecipientsWei < dynamicExpectedPaid) {
    throw new Error(
      `Economics mismatch: contract paid_to_recipients (${paidToRecipientsWei}) is less than sum of RELEASED escrows (${dynamicExpectedPaid})`
    );
  }
  if (refundedToFundersWei < dynamicExpectedRefunded) {
    throw new Error(
      `Economics mismatch: contract refunded_to_funders (${refundedToFundersWei}) is less than sum of refunded/canceled escrows (${dynamicExpectedRefunded})`
    );
  }
  console.log("  ✓ Stage-aware economics verified: all balances reconcile with on-chain escrow states.");

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
