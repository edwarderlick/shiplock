"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { WalletModal } from "./WalletModal";
import { formatAddress } from "@/lib/format";
import { STUDIO_NEXT } from "@/lib/network";

export function Chrome({ children }: { children: React.ReactNode }) {
  const { address, chainId, balance, isWrongNetwork, switchOrAddStudioNext, disconnect } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    try {
      await switchOrAddStudioNext();
    } finally {
      setIsSwitching(false);
    }
  };

  // Build chip label from real chain
  const chainLabel =
    address && chainId
      ? chainId === STUDIO_NEXT.chainId
        ? `Studio Next (${chainId})`
        : `Chain ${chainId}`
      : null;

  const hasContractAddress = !!(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
        <div className="w-full px-margin-sm md:px-margin flex flex-col">
          {/* Wrong Network Banner — only shows when address is set and chain is wrong */}
          {isWrongNetwork && (
            <div className="w-full py-space-xs px-space-sm bg-error-container text-on-error-container font-mono-label-xs text-mono-label-xs tracking-wider uppercase flex items-center justify-between" id="network-alert">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[14px]">warning</span>
                <span>UNSUPPORTED NETWORK. REQUIRED: GENLAYER STUDIO NEXT (CHAIN ID 61997)</span>
              </div>
              <button
                onClick={handleSwitchNetwork}
                disabled={isSwitching}
                className="px-space-sm py-0.5 bg-error text-on-error font-mono-label-xs uppercase hover:bg-surface-bright disabled:opacity-60 transition-colors"
              >
                {isSwitching ? "SWITCHING..." : "SWITCH TO STUDIO NEXT"}
              </button>
            </div>
          )}

          <div className="h-16 w-full flex items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-lg">
              <Link href="/" className="flex items-center gap-space-sm">
                <div className="flex flex-col">
                  <span className="font-headline-sm text-headline-sm uppercase tracking-tight text-primary leading-none">ShipLock</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-widest">REGISTRY // ESCROW</span>
                </div>
              </Link>
              {/* Contract address badge — only shown when NEXT_PUBLIC_CONTRACT_ADDRESS is set */}
              <div className="hidden xl:flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs text-on-surface-variant px-space-sm py-1 bg-surface-container-low">
                <span className="text-primary-fixed">[SYS: CAD_v2.4]</span>
                <span className="text-outline">{"//"}</span>
                {hasContractAddress ? (
                  <span className="text-secondary font-mono truncate max-w-[120px]">
                    {process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!.substring(0, 6)}...{process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!.slice(-4)}
                  </span>
                ) : (
                  <span className="text-outline">CONTRACT NOT WIRED</span>
                )}
              </div>
            </div>

            <nav className="hidden lg:flex items-center gap-space-xs font-body-md text-body-md">
              <Link href="/lock" className="px-space-md py-space-xs text-on-surface-variant hover:text-on-surface transition-colors uppercase font-medium">Lock Escrow</Link>
              <Link href="/browse" className="px-space-md py-space-xs text-on-surface-variant hover:text-on-surface transition-colors uppercase font-medium">Browse</Link>
              <Link href="/me" className="px-space-md py-space-xs text-on-surface-variant hover:text-on-surface transition-colors uppercase font-medium">My Locks</Link>
              <Link href="/economics" className="px-space-md py-space-xs text-on-surface-variant hover:text-on-surface transition-colors uppercase font-medium">Economics</Link>
              <Link href="/how" className="px-space-md py-space-xs text-on-surface-variant hover:text-on-surface transition-colors uppercase font-medium">How it works</Link>
            </nav>

            <div className="flex items-center gap-space-sm sm:gap-space-md">
              {address ? (
                <>
                  {/* Real chain chip */}
                  <div className="hidden sm:flex items-center gap-space-sm px-space-sm py-1.5 bg-surface-container-low font-mono-data-sm text-mono-data-sm">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isWrongNetwork ? "bg-error" : "bg-primary-fixed"}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isWrongNetwork ? "bg-error" : "bg-primary-fixed"}`}></span>
                    </span>
                    <span className={`${isWrongNetwork ? "text-error" : "text-on-surface"}`}>
                      {chainLabel ?? "Unknown Chain"}
                    </span>
                  </div>
                  {/* Address + balance chip — opens modal for disconnect */}
                  <button
                    onClick={() => setIsWalletModalOpen(true)}
                    className="flex items-center gap-space-sm px-space-md py-1.5 bg-surface-container font-mono-data-sm text-mono-data-sm hover:bg-surface-container-high transition-colors"
                  >
                    <span className="text-primary-fixed font-medium">{balance} GEN</span>
                    <span className="text-outline">|</span>
                    <span className="text-on-surface tracking-wider">{formatAddress(address)}</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsWalletModalOpen(true)}
                  className="px-space-md py-1.5 bg-primary-fixed text-on-primary-fixed font-mono-data-sm text-mono-data-sm font-semibold uppercase hover:bg-primary transition-colors"
                >
                  CONNECT_SIGNER
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="w-full pt-16 bg-surface">
        {children}
      </main>

      <footer className="w-full bg-surface-container-lowest py-space-xl">
        <div className="w-full px-margin-sm md:px-margin flex flex-col gap-space-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-space-lg">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-sm text-headline-sm text-primary uppercase">ShipLock</span>
                <span className="font-mono-label-xs text-mono-label-xs px-1.5 py-0.5 bg-primary-container text-on-primary-container font-semibold">TESTNET</span>
              </div>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">Programmatic smart escrow for decentralized registry artifact publication and validation.</p>
            </div>
            <div className="flex flex-col gap-space-xs">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">GENLAYER NETWORK SPEC</span>
              <div className="flex flex-col gap-1 font-mono-data-sm text-mono-data-sm">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Chain ID</span>
                  <span className="text-on-surface">61997</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>RPC Endpoint</span>
                  <a className="text-primary-fixed hover:underline truncate max-w-[140px]" href="https://studio-dev.genlayer.com/api" target="_blank" rel="noreferrer">studio-dev.genlayer.com</a>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>Studio Explorer</span>
                  <a className="text-primary-fixed hover:underline" href="https://explorer-studio-dev.genlayer.com/" target="_blank" rel="noreferrer">explorer-studio-dev</a>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-sm">
            <div className="flex items-center gap-space-sm font-mono-data-sm text-mono-data-sm text-error">
              <span className="material-symbols-outlined text-[16px]">info</span>
              <span>TESTNET DISCLAIMER: All escrow, payouts, and refunds are test GEN with no real monetary value.</span>
            </div>
            <div className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[LOC: GENLAYER_STUDIO // 0x61997_DEV]</div>
          </div>
        </div>
      </footer>

      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
    </>
  );
}
