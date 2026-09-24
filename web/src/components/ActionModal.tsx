import React, { useState } from "react";
import { writeIc } from "../lib/write";
import { useWallet } from "../lib/wallet";

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

  const handleExecute = async () => {
    if (!address || !selectedProvider) return;
    setTxProgress("ESTIMATING FEES");
    setTxError(null);
    setTxHash(null);
    setTxStatus(null);
    setTxExec(null);

    try {
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
      setTxProgress("SUCCESS");
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (e: any) {
      console.error(e);
      const msg = e?.details || e?.shortMessage || e?.message || String(e);
      setTxError(msg);
      setTxProgress("FAILED");
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
          <button onClick={onClose} className="hover:text-primary-fixed">
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
              <div className="flex flex-col gap-1 p-2 bg-surface-dim border border-primary-fixed/20">
                <div className="flex items-center justify-between">
                  <span className="text-primary-fixed font-bold">STATUS: {txProgress}</span>
                </div>
                {txHash && (
                  <div className="text-on-surface">
                    TX Hash: <a href={`https://explorer-studio-dev.genlayer.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-primary hover:underline font-mono break-all">{txHash}</a>
                  </div>
                )}
                {txStatus && txProgress !== "SUCCESS" && (
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
            <button 
              onClick={onClose}
              disabled={txProgress !== 'REVIEW' && txProgress !== 'FAILED' && txProgress !== 'SUCCESS'}
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
          </div>
        </div>
      </div>
    </div>
  );
}
