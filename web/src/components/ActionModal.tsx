import React, { useState } from "react";
import { writeIc } from "../lib/write";
import { useWallet } from "../lib/wallet";
import { client } from "../lib/contract";
import { CONTRACT_ADDRESS } from "../lib/env";
import { pollActionOutcome } from "../lib/action";

export interface PostActionOutcome {
  status: string;
  match_reason: string;
  payout: string;
  refund: string;
}

export function ActionModal({ 
  escrowId, 
  action, 
  onClose, 
  onSuccess 
}: { 
  escrowId: string, 
  action: string, 
  onClose: () => void, 
  onSuccess: () => void 
}) {
  const { address, selectedProvider } = useWallet();
  const [txProgress, setTxProgress] = useState<string>("REVIEW");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txExec, setTxExec] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [postOutcome, setPostOutcome] = useState<PostActionOutcome | null>(null);
  const [preTxEscrow, setPreTxEscrow] = useState<any>(null);
  const [isRechecking, setIsRechecking] = useState(false);

  const handleRecheck = async () => {
    setIsRechecking(true);
    setTxError(null);
    try {
      const outcome = await pollActionOutcome({
        client,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        action,
        initialEscrow: preTxEscrow,
        maxAttempts: 8,
        intervalMs: 1200,
      });

      setPostOutcome({
        status: outcome.status,
        match_reason: outcome.matchReason || "",
        payout: outcome.payout,
        refund: outcome.refund,
      });
      setTxProgress(outcome.status);
    } catch (e: any) {
      console.error(e);
      setTxError(e?.message || String(e));
    } finally {
      setIsRechecking(false);
    }
  };

  const handleExecute = async () => {
    if (!address || !selectedProvider) return;
    setTxProgress("ESTIMATING FEES");
    setTxError(null);
    setTxHash(null);
    setTxStatus(null);
    setTxExec(null);
    setPostOutcome(null);

    try {
      // Capture pre-transaction escrow state to detect fresh post-tx updates
      let initialEscrow: any = null;
      try {
        initialEscrow = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: "get_escrow",
          args: [escrowId],
        });
      } catch {
        // ignore pre-read failure
      }
      setPreTxEscrow(initialEscrow);

      await writeIc({
        account: address,
        provider: selectedProvider,
        functionName: action,
        args: [escrowId],
        onProgress: (stage, extra) => {
          setTxProgress(stage);
          if (extra?.hash) setTxHash(extra.hash);
          if (extra?.status) setTxStatus(extra.status);
          if (extra?.exec) setTxExec(extra.exec);
        }
      });

      // Poll get_escrow for a bounded period to avoid acting on stale read replica
      setTxProgress("VERIFYING ON-CHAIN OUTCOME");
      const outcome = await pollActionOutcome({
        client,
        contractAddress: CONTRACT_ADDRESS,
        escrowId,
        action,
        initialEscrow,
        maxAttempts: 10,
        intervalMs: 1500,
      });

      setPostOutcome({
        status: outcome.status,
        match_reason: outcome.matchReason || "",
        payout: outcome.payout,
        refund: outcome.refund,
      });

      // Keep confirmed outcome visible until user selects Done & Refresh
      setTxProgress(outcome.status);
    } catch (e: any) {
      console.error(e);
      const msg = e?.details || e?.shortMessage || e?.message || String(e);
      setTxError(msg);
      setTxProgress("FAILED");
    }
  };

  const isDoneState = [
    "OPEN_RETRYABLE",
    "RELEASED",
    "REFUND_NOHIT",
    "CANCELED",
    "EXPIRED",
    "CONFIRMATION_PENDING",
    "FINALIZED",
  ].includes(txProgress);

  const handleClose = () => {
    if (isDoneState) {
      onSuccess();
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur-md">
      <div className="w-full max-w-xl bg-surface-container shadow-2xl flex flex-col relative overflow-hidden border border-outline/20">
        <div className="w-full bg-surface-container-high px-space-md py-space-sm flex items-center justify-between font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[16px] text-primary-fixed">play_circle</span>
            <span className="text-primary font-bold">EXECUTE OPERATION: {action}</span>
          </div>
          <button onClick={handleClose} className="hover:text-primary-fixed">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        
        <div className="p-space-lg flex flex-col gap-space-md">
          <div className="font-headline-sm text-headline-sm text-on-surface uppercase">
            Confirm <span className="text-primary-fixed">{action}</span> on Escrow
          </div>
          <div className="font-mono-data-sm text-mono-data-sm text-on-surface-variant break-all">
            ID: {escrowId}
          </div>

          <div className="p-space-sm bg-surface-container-lowest text-on-surface-variant font-mono-data-sm text-[11px] flex flex-col gap-space-sm mt-space-sm">
            {txProgress !== 'REVIEW' && (
              <div className="flex flex-col gap-1.5 p-3 bg-surface-dim border border-primary-fixed/20">
                <div className="flex items-center justify-between">
                  <span className="text-primary-fixed font-bold">STATUS: {txProgress}</span>
                </div>

                {txHash && (
                  <div className="text-on-surface">
                    TX Hash:{" "}
                    <a 
                      href={`https://explorer-studio-dev.genlayer.com/tx/${txHash}`} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-primary hover:underline font-mono break-all"
                    >
                      {txHash}
                    </a>
                  </div>
                )}

                {/* Retryable OPEN Outcome */}
                {txProgress === "OPEN_RETRYABLE" && (
                  <div className="p-2.5 bg-secondary-container/20 border border-secondary text-on-surface flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-secondary font-bold font-mono-label-xs uppercase">
                      <span className="material-symbols-outlined text-[16px]">sync</span>
                      <span>Registry check complete, escrow still open — retry later</span>
                    </div>
                    <p className="text-[12px] text-on-surface-variant">
                      Reason: <strong className="text-on-surface font-mono">{postOutcome?.match_reason || "EARLY_CHECK_INCONCLUSIVE"}</strong>.
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      The package release window remains active. No funds were transferred. A later release check can be initiated whenever the package is ready.
                    </p>
                  </div>
                )}

                {/* Settle: RELEASED */}
                {txProgress === "RELEASED" && (
                  <div className="p-2.5 bg-primary-container/20 border border-primary-fixed text-on-surface flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-primary-fixed font-bold font-mono-label-xs uppercase">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      <span>100% Principal Released to Recipient</span>
                    </div>
                    <p className="text-[12px] text-on-surface-variant">
                      Match reason: <strong className="text-on-surface font-mono">{postOutcome?.match_reason}</strong>
                    </p>
                  </div>
                )}

                {/* Settle: REFUND_NOHIT */}
                {txProgress === "REFUND_NOHIT" && (
                  <div className="p-2.5 bg-error-container/20 border border-error text-on-surface flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-error font-bold font-mono-label-xs uppercase">
                      <span className="material-symbols-outlined text-[16px]">assignment_return</span>
                      <span>100% Principal Refunded to Funder</span>
                    </div>
                    <p className="text-[12px] text-on-surface-variant">
                      Match reason: <strong className="text-on-surface font-mono">{postOutcome?.match_reason}</strong>
                    </p>
                  </div>
                )}

                {/* Settle: CANCELED */}
                {txProgress === "CANCELED" && (
                  <div className="p-2.5 bg-surface-container-high border border-outline text-on-surface flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-secondary font-bold font-mono-label-xs uppercase">
                      <span className="material-symbols-outlined text-[16px]">cancel</span>
                      <span>Escrow Canceled — 100% Refunded to Funder</span>
                    </div>
                  </div>
                )}

                {/* Settle: EXPIRED */}
                {txProgress === "EXPIRED" && (
                  <div className="p-2.5 bg-surface-container-high border border-outline text-on-surface flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-secondary font-bold font-mono-label-xs uppercase">
                      <span className="material-symbols-outlined text-[16px]">timer_off</span>
                      <span>Escrow Expired — 100% Refunded to Funder</span>
                    </div>
                  </div>
                )}

                {/* Stale / Pending check outcome */}
                {txProgress === "CONFIRMATION_PENDING" && (
                  <div className="p-2.5 bg-surface-container-high border border-outline text-on-surface flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-secondary font-bold font-mono-label-xs uppercase">
                      <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
                      <span>Confirmation Pending — State Sync Delayed</span>
                    </div>
                    <p className="text-[12px] text-on-surface-variant">
                      The transaction was finalized, but contract state has not updated on read replicas within the polling window. 
                      No outcome (payout, refund, or retry) will be falsely reported until confirmed on-chain.
                    </p>
                    <button
                      onClick={handleRecheck}
                      disabled={isRechecking}
                      className="self-start px-3 py-1 bg-secondary text-on-secondary hover:bg-secondary-dim font-mono-label-xs uppercase flex items-center gap-1 font-bold text-[11px] disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">sync</span>
                      <span>{isRechecking ? "Polling State..." : "Recheck State Now"}</span>
                    </button>
                  </div>
                )}

                {txStatus && !isDoneState && (
                  <div className="text-on-surface-variant">
                    Consensus: {txStatus} {txExec && ` / Exec: ${txExec}`}
                  </div>
                )}

                {txError && (
                  <div className="text-error mt-1 font-mono-label-xs break-all">
                    {txError}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-space-md mt-space-md">
            {isDoneState ? (
              <button 
                onClick={() => {
                  onSuccess();
                }}
                className="px-space-xl py-space-xs bg-primary-container text-on-primary-container hover:bg-primary font-headline-sm text-headline-sm uppercase font-bold flex items-center gap-space-xs shadow-md"
              >
                <span>Done &amp; Refresh</span>
                <span className="material-symbols-outlined text-[18px]">done</span>
              </button>
            ) : (
              <>
                <button 
                  onClick={onClose}
                  disabled={txProgress !== 'REVIEW' && txProgress !== 'FAILED'}
                  className="px-space-md py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface font-headline-sm text-body-md uppercase disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button 
                  onClick={handleExecute}
                  disabled={txProgress !== 'REVIEW' && txProgress !== 'FAILED'}
                  className="px-space-lg py-space-xs bg-primary-container text-on-primary-container hover:bg-primary font-headline-sm text-headline-sm uppercase font-bold flex items-center gap-space-xs shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {txProgress === 'REVIEW' || txProgress === 'FAILED' ? 'Sign & Execute' : 'Processing...'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
