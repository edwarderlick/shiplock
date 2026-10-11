export interface ActionOutcomeResult {
  status:
    | "OPEN_RETRYABLE"
    | "RELEASED"
    | "REFUND_NOHIT"
    | "CANCELED"
    | "EXPIRED"
    | "CONFIRMATION_PENDING";
  matchReason?: string;
  payout: string;
  refund: string;
  escrow?: any;
}

export interface PollActionOutcomeOptions {
  client: any;
  contractAddress: string;
  escrowId: string;
  action: string;
  initialEscrow?: { status: string; match_reason?: string } | null;
  maxAttempts?: number;
  intervalMs?: number;
}

/**
 * Polls on-chain get_escrow for a bounded period after a transaction finalizes.
 * Ensures we do not classify a stale read replica as the result of the new transaction.
 * Returns CONFIRMATION_PENDING if fresh confirmation cannot be established within the timeout.
 */
export async function pollActionOutcome({
  client,
  contractAddress,
  escrowId,
  action,
  initialEscrow,
  maxAttempts = 10,
  intervalMs = 500,
}: PollActionOutcomeOptions): Promise<ActionOutcomeResult> {
  const initStatus = initialEscrow?.status;
  const initReason = initialEscrow?.match_reason || "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const e = await client.readContract({
        address: contractAddress,
        functionName: "get_escrow",
        args: [escrowId],
      });

      if (e) {
        const curStatus = e.status;
        const curReason = e.match_reason || "";

        if (action === "release") {
          if (curStatus === "RELEASED") {
            return {
              status: "RELEASED",
              matchReason: curReason,
              payout: String(e.payout ?? e.amount ?? "0"),
              refund: "0",
              escrow: e,
            };
          }
          if (curStatus === "REFUND_NOHIT") {
            return {
              status: "REFUND_NOHIT",
              matchReason: curReason,
              payout: "0",
              refund: String(e.refund ?? e.amount ?? "0"),
              escrow: e,
            };
          }
          if (curStatus === "OPEN") {
            // If the pre-transaction get_escrow read failed (initialEscrow is missing/null),
            // an existing OPEN match_reason cannot prove a fresh check.
            const hasBaseline = Boolean(initialEscrow && initStatus);
            const isFreshCheck =
              hasBaseline &&
              curReason !== "" &&
              (initStatus !== "OPEN" || curReason !== initReason);

            if (isFreshCheck) {
              return {
                status: "OPEN_RETRYABLE",
                matchReason: curReason,
                payout: "0",
                refund: "0",
                escrow: e,
              };
            }
          }
        } else if (action === "cancel") {
          if (curStatus === "CANCELED") {
            return {
              status: "CANCELED",
              matchReason: curReason,
              payout: "0",
              refund: String(e.refund ?? e.amount ?? "0"),
              escrow: e,
            };
          }
        } else if (action === "expire") {
          if (curStatus === "EXPIRED") {
            return {
              status: "EXPIRED",
              matchReason: curReason,
              payout: "0",
              refund: String(e.refund ?? e.amount ?? "0"),
              escrow: e,
            };
          }
        }
      }
    } catch {
      // transient read failure, retry
    }

    if (attempt < maxAttempts - 1 && intervalMs > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  // If bounded polling exhausts without establishing confirmed new state:
  return {
    status: "CONFIRMATION_PENDING",
    payout: "0",
    refund: "0",
  };
}
