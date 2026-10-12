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

  // 2. Query all on-chain escrow IDs and reconcile economics against EVERY escrow returned by the contract
  console.log("\n--- 2. Reconciling Economics Against All On-Chain Escrows ---");
  let allOnChainIds = null;
  try {
    allOnChainIds = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow_ids",
      args: [],
    });
  } catch (err) {
    throw new Error(`Failed to query get_escrow_ids from contract: ${err.message || err}`);
  }

  if (!Array.isArray(allOnChainIds)) {
    throw new Error("get_escrow_ids did not return an array");
  }
  console.log(`Found ${allOnChainIds.length} total escrow(s) on-chain.`);

  let totalOnChainOpen = 0n;
  let totalOnChainPaid = 0n;
  let totalOnChainRefunded = 0n;

  for (const escId of allOnChainIds) {
    const esc = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [escId],
    });
    if (!esc || !esc.status) {
      throw new Error(`On-chain escrow ${escId} returned empty or invalid data`);
    }

    const principalWei = BigInt((esc.principal_wei || esc.amount || 0n).toString());
    const payoutWei = BigInt((esc.payout_recipient || esc.payout || 0n).toString());
    const refundWei = BigInt((esc.refund_funder || esc.refund || 0n).toString());

    if (esc.status === "OPEN") {
      totalOnChainOpen += principalWei;
      if (payoutWei !== 0n || refundWei !== 0n) {
        throw new Error(`On-chain escrow ${escId} is OPEN but has non-zero payout (${payoutWei}) or refund (${refundWei})`);
      }
    } else if (esc.status === "RELEASED") {
      totalOnChainPaid += principalWei;
      if (payoutWei !== principalWei) {
        throw new Error(`On-chain escrow ${escId} is RELEASED but payout (${payoutWei}) does not match principal (${principalWei})`);
      }
    } else if (esc.status === "REFUND_NOHIT" || esc.status === "CANCELED" || esc.status === "EXPIRED") {
      totalOnChainRefunded += principalWei;
      if (refundWei !== principalWei) {
        throw new Error(`On-chain escrow ${escId} is ${esc.status} but refund (${refundWei}) does not match principal (${principalWei})`);
      }
    } else {
      throw new Error(`On-chain escrow ${escId} has unrecognized status: ${esc.status}`);
    }
  }

  const escrowedOpenWei = BigInt(economics.escrowed_open.toString());
  const paidToRecipientsWei = BigInt(economics.paid_to_recipients.toString());
  const refundedToFundersWei = BigInt(economics.refunded_to_funders.toString());

  console.log(`  Contract escrowed_open:      ${escrowedOpenWei.toString()} wei (sum of all on-chain OPEN: ${totalOnChainOpen.toString()})`);
  console.log(`  Contract paid_to_recipients:  ${paidToRecipientsWei.toString()} wei (sum of all on-chain RELEASED: ${totalOnChainPaid.toString()})`);
  console.log(`  Contract refunded_to_funders: ${refundedToFundersWei.toString()} wei (sum of all on-chain REFUNDED: ${totalOnChainRefunded.toString()})`);

  if (escrowedOpenWei !== totalOnChainOpen) {
    throw new Error(
      `Economics mismatch: contract escrowed_open (${escrowedOpenWei}) does not match sum of all on-chain OPEN escrows (${totalOnChainOpen})`
    );
  }
  if (paidToRecipientsWei !== totalOnChainPaid) {
    throw new Error(
      `Economics mismatch: contract paid_to_recipients (${paidToRecipientsWei}) does not match sum of all on-chain RELEASED escrows (${totalOnChainPaid})`
    );
  }
  if (refundedToFundersWei !== totalOnChainRefunded) {
    throw new Error(
      `Economics mismatch: contract refunded_to_funders (${refundedToFundersWei}) does not match sum of all on-chain refunded escrows (${totalOnChainRefunded})`
    );
  }
  console.log("  ✓ Economics reconciled against every on-chain escrow returned by contract.");

  // 3. Separately validate the steward evidence escrows
  console.log("\n--- 3. Steward Evidence Escrows Validation & Authoritative Fee Estimation ---");
  const onChainIdSet = new Set(allOnChainIds.map((x) => String(x).toLowerCase()));

  for (const item of ESCROWS_TO_CHECK) {
    console.log(`\nChecking steward escrow ${item.name} (${item.id})...`);
    if (!onChainIdSet.has(item.id.toLowerCase())) {
      throw new Error(`Steward evidence escrow ${item.name} (${item.id}) not found among on-chain escrow IDs!`);
    }

    let esc = null;
    try {
      esc = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_escrow",
        args: [item.id],
      });
    } catch (readErr) {
      throw new Error(`Failed to read steward escrow ${item.name} (${item.id}): ${readErr.message || readErr}`);
    }

    if (!esc || !esc.status) {
      throw new Error(`Steward escrow ${item.name} (${item.id}) returned empty or invalid data`);
    }

    const principalWei = BigInt((esc.principal_wei || esc.amount || 0n).toString());
    const payoutWei = BigInt((esc.payout_recipient || esc.payout || 0n).toString());
    const refundWei = BigInt((esc.refund_funder || esc.refund || 0n).toString());

    console.log(`  Status: ${esc.status}, match_reason: ${esc.match_reason}, principal: ${principalWei.toString()} wei`);
    console.log(`  Funder: ${esc.funder}, Recipient: ${esc.recipient}`);

    // Verify principal matches expected allocation
    if (item.expectedAmount && principalWei !== item.expectedAmount) {
      throw new Error(`Steward escrow ${item.name} principal mismatch: expected ${item.expectedAmount.toString()}, got ${principalWei.toString()}`);
    }

    // Stage-aware status validation for steward escrows
    const VALID_LIFECYCLE_STATUSES = ["OPEN", "RELEASED", "REFUND_NOHIT", "CANCELED", "EXPIRED"];
    if (!VALID_LIFECYCLE_STATUSES.includes(esc.status)) {
      throw new Error(`Steward escrow ${item.name} has unrecognized status: ${esc.status}`);
    }

    if (esc.status === "OPEN") {
      if (payoutWei !== 0n || refundWei !== 0n) {
        throw new Error(`Steward escrow ${item.name} is OPEN but has non-zero payout (${payoutWei}) or refund (${refundWei})`);
      }
    } else if (esc.status === "RELEASED") {
      if (esc.match_reason !== "200_IN_WINDOW") {
        throw new Error(`Steward escrow ${item.name} is RELEASED but match_reason is '${esc.match_reason}' (expected 200_IN_WINDOW)`);
      }
      if (payoutWei !== principalWei) {
        throw new Error(`Steward escrow ${item.name} is RELEASED but payout (${payoutWei}) does not match principal (${principalWei})`);
      }
      console.log(`  ✓ Verified legitimate terminal RELEASED settlement state (payout: ${payoutWei} wei)`);
    } else if (esc.status === "REFUND_NOHIT") {
      if (refundWei !== principalWei) {
        throw new Error(`Steward escrow ${item.name} is REFUND_NOHIT but refund (${refundWei}) does not match principal (${principalWei})`);
      }
      if (payoutWei !== 0n) {
        throw new Error(`Steward escrow ${item.name} is REFUND_NOHIT but payout (${payoutWei}) is non-zero`);
      }
      console.log(`  ✓ Verified legitimate terminal REFUND_NOHIT settlement state (refund: ${refundWei} wei, match_reason: ${esc.match_reason})`);
    } else if (esc.status === "CANCELED") {
      if (refundWei !== principalWei) {
        throw new Error(`Steward escrow ${item.name} is CANCELED but refund (${refundWei}) does not match principal (${principalWei})`);
      }
      if (payoutWei !== 0n) {
        throw new Error(`Steward escrow ${item.name} is CANCELED but payout (${payoutWei}) is non-zero`);
      }
      console.log(`  ✓ Verified legitimate terminal CANCELED settlement state (refund: ${refundWei} wei, match_reason: ${esc.match_reason})`);
    } else if (esc.status === "EXPIRED") {
      if (refundWei !== principalWei) {
        throw new Error(`Steward escrow ${item.name} is EXPIRED but refund (${refundWei}) does not match principal (${principalWei})`);
      }
      if (payoutWei !== 0n) {
        throw new Error(`Steward escrow ${item.name} is EXPIRED but payout (${payoutWei}) is non-zero`);
      }
      console.log(`  ✓ Verified legitimate terminal EXPIRED settlement state (refund: ${refundWei} wei, match_reason: ${esc.match_reason})`);
    }

    // Test allocation construction and authoritative fee estimation for OPEN steward escrows
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

  console.log("\n=======================================================");
  console.log("✓ Preflight check succeeded for all on-chain and steward escrows.");
  console.log("✓ All escrow reads, allocation builds, and fee validations passed.");
  console.log("✓ No live transactions were submitted (read-only verification).");
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("\n❌ PREFLIGHT CHECK FAILED:", err.message || err);
  process.exit(1);
});
