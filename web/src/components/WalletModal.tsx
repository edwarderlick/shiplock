"use client";

import React, { useState } from "react";
import { useWallet, WalletOption } from "@/lib/wallet";
import { STUDIO_NEXT } from "@/lib/network";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const {
    options,
    isDiscovering,
    connect,
    disconnect,
    switchOrAddStudioNext,
    isWrongNetwork,
    address,
    chainId,
    balance,
    connectError,
    clearError,
    discover,
  } = useWallet();

  const [localError, setLocalError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [connectingRdns, setConnectingRdns] = useState<string | null>(null);

  // Open = trigger discovery
  const [hasDiscovered, setHasDiscovered] = useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen && !hasDiscovered) {
      setHasDiscovered(true);
      setLocalError(null);
      discover();
    }
    if (!isOpen) {
      setHasDiscovered(false);
      setConnectingRdns(null);
      setLocalError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const displayError = localError ?? connectError;

  const handleConnect = async (opt: WalletOption) => {
    setLocalError(null);
    clearError();
    setConnectingRdns(opt.rdns);
    try {
      await connect(opt);
      onClose();
    } catch (err: unknown) {
      setLocalError((err as Error).message ?? "Connection failed.");
    } finally {
      setConnectingRdns(null);
    }
  };

  const handleSwitch = async () => {
    setLocalError(null);
    clearError();
    setIsSwitching(true);
    try {
      await switchOrAddStudioNext();
    } catch (err: unknown) {
      setLocalError((err as Error).message ?? "Network switch failed.");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    onClose();
  };

  const chainLabel = chainId
    ? chainId === STUDIO_NEXT.chainId
      ? `Studio Next (${chainId})`
      : `Unknown (${chainId})`
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur-md" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Outer Blueprint Wrapper Chamber */}
      <div className="w-full max-w-3xl bg-surface-container-lowest shadow-2xl flex flex-col relative overflow-hidden" id="auth-modal">

        {/* Top Technical Coordinate Status Strip */}
        <div className="w-full bg-surface-container-high px-space-md py-space-xs flex items-center justify-between font-mono-label-xs text-mono-label-xs text-on-surface-variant select-none">
          <div className="flex items-center gap-space-sm">
            <span className="w-2 h-2 rounded-none bg-primary-fixed"></span>
            <span className="text-primary font-semibold tracking-wider">DIAGNOSTIC &amp; AUTH SUITE</span>
            <span className="text-outline">{"//"}</span>
            <span className="text-secondary font-normal">[LOC: 0x4B // GEN_61997]</span>
          </div>
          <div className="flex items-center gap-space-md">
            <span className="hidden sm:inline text-outline">SPEC: EIP-6963</span>
            <button
              onClick={onClose}
              aria-label="Close modal dialog"
              className="w-6 h-6 flex items-center justify-center bg-surface-container hover:bg-surface-bright text-on-surface hover:text-primary-fixed transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>

        {/* Wrong-network banner inside modal when already connected */}
        {address && isWrongNetwork && (
          <div className="w-full py-space-xs px-space-md bg-error-container text-on-error-container font-mono-label-xs text-mono-label-xs tracking-wider uppercase flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[14px]">warning</span>
              <span>WRONG NETWORK — REQUIRED: GENLAYER STUDIO NEXT (61997)</span>
            </div>
            <button
              onClick={handleSwitch}
              disabled={isSwitching}
              className="px-space-sm py-0.5 bg-error text-on-error font-mono-label-xs uppercase hover:bg-surface-bright disabled:opacity-60 transition-colors"
            >
              {isSwitching ? "SWITCHING..." : "SWITCH TO STUDIO NEXT"}
            </button>
          </div>
        )}

        {/* Main Modal Lead */}
        <div className="p-space-lg md:p-space-xl bg-surface-container flex flex-col gap-space-xs relative">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-space-xs">
            <div className="flex items-center gap-space-sm">
              <span className="px-space-xs py-0.5 bg-primary-fixed text-on-primary-fixed font-mono-label-xs text-mono-label-xs font-semibold tracking-widest uppercase">
                {address ? "STAGE: CONNECTED" : "STAGE: HANDSHAKE"}
              </span>
              <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">ISOLATED SESSION</span>
            </div>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight mt-space-xs">
            {address ? "Wallet Connected" : "Connect Identity & Synchronize Ledger"}
          </h1>
          {address ? (
            <div className="flex flex-col gap-1">
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                <span className="text-primary">{address}</span>
              </p>
              <div className="flex flex-wrap items-center gap-space-md font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                <span>BALANCE: <span className="text-primary-fixed font-medium">{balance} GEN</span></span>
                {chainLabel && <span>CHAIN: <span className={isWrongNetwork ? "text-error" : "text-primary-fixed"}>{chainLabel}</span></span>}
              </div>
            </div>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant max-w-xl">
              Programmatic settlement through ShipLock oracles requires zero-trust cryptographic signature and real-time state access on GenLayer Studio Next.
            </p>
          )}
        </div>

        {/* Error display */}
        {displayError && (
          <div className="px-space-lg py-space-sm bg-error-container text-on-error-container font-mono-data-sm text-mono-data-sm flex items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{displayError}</span>
            </div>
            <button onClick={() => { clearError(); setLocalError(null); }} className="text-on-error-container hover:text-on-error transition-colors">
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        )}

        {/* Connector Options Matrix — only when NOT already connected */}
        {!address && (
          <div className="p-space-lg md:p-space-xl bg-surface flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-widest">
                AUTHENTICATION RAILS // AVAILABLE PROVIDERS
              </span>
              <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">
                {isDiscovering ? "SCANNING..." : `${options.length < 10 ? `0${options.length}` : options.length} DETECTED`}
              </span>
            </div>

            {isDiscovering ? (
              <div className="flex items-center justify-center py-space-xl text-on-surface-variant font-mono-data-sm text-mono-data-sm gap-space-sm">
                <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
                <span>SCANNING FOR BROWSER WALLETS...</span>
              </div>
            ) : options.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-space-xl gap-space-md text-center">
                <span className="material-symbols-outlined text-[40px] text-outline">account_balance_wallet</span>
                <div className="flex flex-col gap-space-xs max-w-sm">
                  <span className="font-headline-sm text-headline-sm text-primary">No Wallet Detected</span>
                  <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                    No browser wallet found. Install MetaMask, Rabby, Brave, Coinbase, or OKX.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                {options.map((opt, idx) => {
                  const isConnecting = connectingRdns === opt.rdns;
                  return (
                    <button
                      key={opt.rdns || idx}
                      onClick={() => handleConnect(opt)}
                      disabled={connectingRdns !== null}
                      className="text-left p-space-md bg-surface-container hover:bg-surface-bright transition-all flex flex-col justify-between relative group disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {opt.name.toLowerCase().includes("genlayer") && (
                        <div className="absolute top-0 right-0 px-2 py-0.5 bg-primary-fixed text-on-primary-fixed font-mono-label-xs text-mono-label-xs font-bold uppercase tracking-wider">
                          NATIVE
                        </div>
                      )}
                      <div className="flex flex-col gap-space-sm pt-2">
                        <div className={`w-10 h-10 flex items-center justify-center transition-colors ${opt.name.toLowerCase().includes("genlayer") ? "bg-surface-container-high text-primary-fixed group-hover:text-primary" : "bg-surface-container-high text-primary group-hover:text-primary-fixed"}`}>
                          {isConnecting ? (
                            <span className="material-symbols-outlined text-[24px] animate-spin">refresh</span>
                          ) : opt.icon ? (
                            <img src={opt.icon} alt={opt.name} className="w-6 h-6 object-contain" />
                          ) : (
                            <span className="material-symbols-outlined text-[24px]">account_balance_wallet</span>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-headline-sm text-headline-sm text-primary uppercase">{opt.name}</span>
                          <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">{opt.rdns || "Injected Provider"}</span>
                        </div>
                      </div>
                      <div className="mt-space-md pt-space-xs flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline group-hover:text-primary-fixed transition-colors">
                        <span>{isConnecting ? "CONNECTING..." : "DETECTED: READY"}</span>
                        <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Disconnect button when connected */}
        {address && (
          <div className="p-space-lg md:p-space-xl bg-surface flex flex-col gap-space-md">
            <div className="flex flex-wrap gap-space-sm">
              {isWrongNetwork && (
                <button
                  onClick={handleSwitch}
                  disabled={isSwitching}
                  className="px-space-md py-space-sm bg-primary-container text-on-primary-container font-mono-data-sm text-mono-data-sm font-bold uppercase hover:bg-primary transition-colors disabled:opacity-60 flex items-center gap-space-xs"
                >
                  {isSwitching ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                      <span>SWITCHING...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                      <span>SWITCH TO STUDIO NEXT</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleDisconnect}
                className="px-space-md py-space-sm bg-surface-container-high text-on-surface font-mono-data-sm text-mono-data-sm uppercase hover:bg-error-container hover:text-on-error-container transition-colors flex items-center gap-space-xs"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                <span>DISCONNECT</span>
              </button>
            </div>
          </div>
        )}

        {/* Node Telemetry & Testnet SLA Footbar */}
        <div className="px-space-lg py-space-md bg-surface-container-high flex flex-col md:flex-row items-start md:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs text-on-surface-variant bg-surface-container px-space-sm py-1">
            <span className="material-symbols-outlined text-[14px] text-primary-fixed">shield_lock</span>
            <span>DISCLAIMER: All escrows, payouts, and refunds are test GEN with zero monetary value.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
