/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { client } from "@/lib/contract";
import { writeIc } from "@/lib/write";
import { formatEther } from "viem";
import { ActionModal } from "@/components/ActionModal";

type Tab = 'open' | 'settled' | 'credits' | 'inactive';

export default function MyLocks() {
  const { address, selectedProvider } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('open');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [escrows, setEscrows] = useState<any[]>([]);
  const [credit, setCredit] = useState(0n);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionIntent, setActionIntent] = useState<{id: string, action: string} | null>(null);

  const load = async () => {
    if (!address) return;
    try {
      const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0xc7464f6d5F14559f878528730333D74481c4d00f";
      const ids = await client.readContract({
        address: contractAddress,
        functionName: "get_escrow_ids",
        args: []
      }) as string[];
      
      const loaded = await Promise.all(ids.map(async (id: string) => {
        const e = await client.readContract({
          address: contractAddress,
          functionName: "get_escrow",
          args: [id]
        }) as any;
        return {
          id: e.id || id,
          registry: e.template === "NPM_VERSION" ? "NPM" : "PYPI",
          state: e.status,
          pkg: e.package_name,
          ver: e.version,
          desc: `Window: ${e.window_start_utc} to ${e.window_end_utc}`,
          funder: e.funder,
          recipient: e.recipient,
          window: e.status === 'OPEN' ? e.window_end_utc : 'Closed',
          amount: BigInt(e.amount),
          statusMsg: e.status,
          isRefund: e.status !== "OPEN" && e.status !== "RELEASED",
          start: new Date(e.window_start_utc).getTime(),
          expire: new Date(e.expire_at_utc).getTime(),
        };
      }));
      
      const addrLower = address.toLowerCase();
      setEscrows(loaded.filter(e => e.funder.toLowerCase() === addrLower || e.recipient.toLowerCase() === addrLower));
      
      const cred = await client.readContract({
        address: contractAddress,
        functionName: "get_credit",
        args: [address]
      });
      setCredit(BigInt(cred as string));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, [address]);

  const executeAction = async (id: string, functionName: string) => {
    if (busyId === id) return;
    setBusyId(id);
    setActionIntent({ id, action: functionName });
  };

  const executeWithdraw = async () => {
    if (credit === 0n) {
      alert('Withdrawal already finalized for this session.');
      return;
    }
    
    setIsWithdrawing(true);
    try {
      await writeIc({
        account: address,
        provider: selectedProvider,
        functionName: "withdraw",
        args: []
      });
      alert(`Withdrew credit.`);
      load();
    } catch(e: any) {
      console.error(e);
      alert('Error withdrawing: ' + (e?.shortMessage || e?.message || String(e)));
    }
    setIsWithdrawing(false);
  };

  const displayAddress = address || "0x71C80f8841a05299D3B5C40f5B5CeeC452414e21";
  const shortAddress = displayAddress ? `${displayAddress.substring(0, 5)}...${displayAddress.substring(displayAddress.length - 4)}` : "0x71C...4e21";

  const handleCopyAddress = () => {
    if (displayAddress) navigator.clipboard.writeText(displayAddress);
  };

  const openLocks = escrows.filter(e => e.state === 'OPEN');
  const settledLocks = escrows.filter(e => e.state !== 'OPEN');
  
  const renderActionButtons = (escrow: any) => {
    const isOpen = escrow.state === 'OPEN';
    if (!isOpen) return null;

    const isFunder = address && address.toLowerCase() === escrow.funder.toLowerCase();
    
    if (now < escrow.start && isFunder) {
      return (
        <button 
          onClick={() => executeAction(escrow.id, "cancel")}
          disabled={busyId === escrow.id}
          className="px-space-md py-space-xs bg-surface-container-highest hover:bg-error-container hover:text-on-error-container text-on-surface font-mono-data-sm text-mono-data-sm font-semibold uppercase transition-colors flex items-center gap-space-xs disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">cancel</span>
          <span>{busyId === escrow.id ? "ABORTING..." : "CANCEL LOCK (REFUND)"}</span>
        </button>
      );
    } else if (now >= escrow.start && now < escrow.expire && !isFunder) {
      return (
        <button 
          onClick={() => executeAction(escrow.id, "release")}
          disabled={busyId === escrow.id}
          className="px-space-md py-space-xs bg-primary-container text-on-primary-container font-mono-data-sm text-mono-data-sm font-bold uppercase hover:bg-primary transition-colors flex items-center gap-space-xs disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">point_of_sale</span>
          <span>{busyId === escrow.id ? "EXECUTING ORACLE SYNC..." : "TRIGGER SETTLEMENT RELEASE"}</span>
        </button>
      );
    } else if (now >= escrow.expire) {
      return (
        <button 
          onClick={() => executeAction(escrow.id, "expire")}
          disabled={busyId === escrow.id}
          className="px-space-md py-space-xs bg-secondary text-on-secondary font-mono-data-sm text-mono-data-sm font-bold uppercase hover:bg-secondary-container transition-colors flex items-center gap-space-xs disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">timer_off</span>
          <span>{busyId === escrow.id ? "EXPIRING..." : "EXPIRE AND REFUND"}</span>
        </button>
      );
    }
    
    return null;
  };

  return (
    <div className="flex flex-col w-full text-on-surface">
      {/* TOP TELEMETRY & COORDINATE STRIP */}
      <section className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-sm font-mono-label-xs text-mono-label-xs uppercase">
          <div className="flex items-center gap-space-md">
            <span className="text-primary-fixed flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-primary-fixed inline-block"></span>
              LEDGER NODE: [STUDIO-NEXT // CH-61997]
            </span>
            <span className="text-outline">|</span>
            <span className="text-on-surface-variant">ESCROW PIPELINE: NOMINAL</span>
          </div>
        </div>
      </section>

      {/* WALLET LEDGER MASTHEAD / BALANCE OVERVIEW */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Primary Identity & Liquid Balance Anchor */}
          <div className="lg:col-span-7 flex flex-col justify-between bg-surface-container-low p-space-lg shadow-sm">
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-widest">[PORTAL IDENTITY // WALLET ACCOUNT]</span>
                <span className="px-space-xs py-0.5 bg-surface-container font-mono-label-xs text-mono-label-xs text-primary-fixed">GENLAYER DEVNET</span>
              </div>
              <div className="flex flex-col gap-1 mt-space-xs">
                <div className="flex items-center gap-space-sm">
                  <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Ledger Status</h1>
                  <span className="material-symbols-outlined text-primary-fixed text-[24px]">verified</span>
                </div>
                <div className="flex flex-wrap items-center gap-space-sm font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                  <span className="text-primary font-medium">{shortAddress}</span>
                  <span className="text-outline">·</span>
                  <span className="text-outline truncate max-w-[280px]">{displayAddress}</span>
                  <button 
                    className="p-1 hover:text-primary-fixed text-on-surface-variant transition-colors" 
                    onClick={handleCopyAddress}
                    title="Copy Address"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-space-lg mt-space-md">
              <div className="bg-surface-container p-space-md flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">AVAILABLE LIQUID TEST GEN</span>
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-mono-metric-lg text-mono-metric-lg text-primary">
                    ---
                  </span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant uppercase">GEN</span>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">Gas Ready · Studio Next RPC</span>
              </div>
              <div className="bg-surface-container p-space-md flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">ACTIVE LOCKED VALUE</span>
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-mono-metric-lg text-mono-metric-lg text-primary">
                    {formatEther(openLocks.reduce((sum, e) => sum + e.amount, 0n))}
                  </span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant uppercase">GEN</span>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">Across {openLocks.length} Open Commitments</span>
              </div>
            </div>
          </div>

          {/* Fallback Pull-Credit Chamber */}
          <div className="lg:col-span-5 bg-surface-container-high p-space-lg flex flex-col justify-between shadow-md">
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-primary-fixed"></span>
                  RECOVERY LEDGER // EMIT_TRANSFER FALLBACK
                </span>
                <span className={`px-space-xs py-0.5 font-mono-label-xs text-mono-label-xs ${credit === 0n ? 'bg-surface-container text-on-surface-variant' : 'bg-error-container text-on-error-container'}`}>
                  {credit === 0n ? '0 UNCLAIMED' : 'FUNDS UNCLAIMED'}
                </span>
              </div>
              <div className="flex flex-col gap-space-xs mt-space-xs">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">OUTSTANDING FALLBACK CREDITS</span>
                <div className="flex items-baseline gap-space-sm">
                  <span className="font-display-lg text-display-lg text-primary-fixed font-normal leading-none">
                    {formatEther(credit)}
                  </span>
                  <span className="font-mono-metric-md text-mono-metric-md text-on-surface">TEST GEN</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1 leading-snug">
                  {credit === 0n ? "All isolated fallback credits have been successfully withdrawn." : "Automatic emit transfer defaulted to contract pull-credit."}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col gap-space-sm mt-space-md pt-space-md">
              <button 
                className={`w-full px-space-md py-space-sm font-headline-sm text-headline-sm uppercase tracking-wider flex items-center justify-between transition-all ${
                  credit === 0n ? 'bg-surface-container-highest text-outline cursor-not-allowed' : 'bg-primary-container text-on-primary-container hover:bg-primary'
                }`}
                onClick={executeWithdraw}
                disabled={credit === 0n || isWithdrawing}
              >
                {isWithdrawing ? (
                  <>
                    <span>EXECUTING EMIT_TRANSFER...</span>
                    <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
                  </>
                ) : credit === 0n ? (
                  <>
                    <span>ZERO BALANCE</span>
                    <span className="material-symbols-outlined text-[20px]">check</span>
                  </>
                ) : (
                  <>
                    <span>WITHDRAW {formatEther(credit)} TEST GEN</span>
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </>
                )}
              </button>
              <div className="flex items-start gap-space-xs font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px] text-outline mt-0.5">info</span>
                <span>Executes contract credit withdrawal to connected wallet via <code className="text-on-surface">emit_transfer</code>.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TAB NAVIGATION SECTION */}
      <section className="w-full px-margin-sm md:px-margin mt-space-md">
        <div className="flex flex-wrap items-center justify-between bg-surface-container-lowest p-space-xs gap-space-sm">
          <div className="flex flex-wrap items-center gap-space-xs font-mono-data-sm text-mono-data-sm">
            {[
              { id: 'open' as Tab, label: '01. Open Locks', count: openLocks.length.toString(), bg: 'bg-on-primary-container/20 text-on-primary-container' },
              { id: 'settled' as Tab, label: '02. Settled Locks', count: settledLocks.length.toString(), bg: 'bg-surface-container-high text-on-surface-variant' },
              { id: 'credits' as Tab, label: '03. Fallback Credits', count: `${formatEther(credit)} GEN`, bg: 'bg-primary-fixed/20 text-primary-fixed' },
              { id: 'inactive' as Tab, label: '04. Inactive Archetype', count: 'EMPTY', bg: 'text-outline' },
            ].map(tab => (
              <button 
                key={tab.id}
                className={`px-space-md py-space-xs font-semibold uppercase flex items-center gap-space-sm transition-colors ${
                  activeTab === tab.id ? 'bg-primary-container text-on-primary-container' : 'bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 text-mono-label-xs font-mono-label-xs ${tab.bg}`}>{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-space-sm px-space-sm py-1 font-mono-label-xs text-mono-label-xs text-outline">
            <span className="w-2 h-2 rounded-full bg-surface-bright inline-block"></span>
            <span>FILTER: CONNECTED WALLET ROLES ONLY</span>
          </div>
        </div>
      </section>

      {/* TAB PANELS WRAPPER */}
      <div className="w-full px-margin-sm md:px-margin py-space-lg mb-space-xl">
        {/* ==================== TAB 1: OPEN LOCKS ==================== */}
        {activeTab === 'open' && (
          <div className="flex flex-col gap-space-md">
            <div className="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-sm text-headline-sm text-primary uppercase">Active Escrow Engagements</span>
                <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">(Live state on GenLayer virtual machine)</span>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed tracking-wider">[STATE_SYNC: SUB-SECOND CONFIRMED]</span>
            </div>
            
            {openLocks.length === 0 ? (
              <div className="p-space-lg text-center text-on-surface-variant">No open locks</div>
            ) : openLocks.map(escrow => (
              <div key={escrow.id} className="bg-surface-container p-space-lg flex flex-col gap-space-md shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-space-sm">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span className="px-space-xs py-0.5 bg-surface-container-highest text-primary font-mono-label-xs text-mono-label-xs uppercase tracking-wider">{escrow.registry} REGISTRY</span>
                      <span className="font-mono-data-sm text-mono-data-sm text-primary-fixed font-semibold tracking-wider">LOCK #{escrow.id}</span>
                    </div>
                    <h2 className="font-headline-md text-headline-md text-primary mt-1">
                      <Link className="hover:text-primary-fixed" href={`/escrow/${escrow.id}`}>{escrow.pkg}</Link>
                      <span className="font-mono-metric-md text-mono-metric-md text-secondary"> @ {escrow.ver}</span>
                    </h2>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="px-space-sm py-1 bg-surface-container-highest text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary-fixed animate-pulse"></span>
                      <span>STATE: OPEN</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-space-sm bg-surface-container-low p-space-md">
                  <div className="flex flex-col">
                    <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">COMMITTED PRINCIPAL</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="font-mono-metric-md text-mono-metric-md text-primary">{formatEther(escrow.amount)}</span>
                      <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">TEST GEN</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">YOUR PARTICIPATION</span>
                    <div className="flex items-center gap-1.5 mt-1 text-primary-fixed font-mono-data-sm text-mono-data-sm">
                      <span className="font-bold">{escrow.funder.toLowerCase() === address?.toLowerCase() ? "FUNDER" : "RECIPIENT"} (YOU)</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">{escrow.funder.toLowerCase() === address?.toLowerCase() ? "BENEFICIARY TARGET" : "FUNDER SOURCE"}</span>
                    <div className="flex items-center gap-1 mt-1 font-mono-data-sm text-mono-data-sm text-on-surface truncate">
                      <span>{escrow.funder.toLowerCase() === address?.toLowerCase() ? escrow.recipient.slice(0, 8) + '...' : escrow.funder.slice(0, 8) + '...'}</span>
                      <span className="material-symbols-outlined text-[14px] text-outline">account_circle</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">SETTLEMENT WINDOW</span>
                    <div className="flex items-center gap-1 mt-1 font-mono-data-sm text-mono-data-sm text-primary">
                      <span className="material-symbols-outlined text-[15px] text-outline">schedule</span>
                      <span>{escrow.window}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
                  {renderActionButtons(escrow) || (
                    <div className="text-on-surface-variant font-mono-data-sm text-mono-data-sm">No action available</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ==================== TAB 2: SETTLED LOCKS ==================== */}
        {activeTab === 'settled' && (
          <div className="flex flex-col gap-space-md">
            <div className="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-sm text-headline-sm text-primary uppercase">Settlement History</span>
                <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">(Immutable past resolutions)</span>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs text-outline">[TOTAL SETTLED VOLUME: {formatEther(settledLocks.reduce((sum, e) => sum + e.amount, 0n))} GEN]</span>
            </div>

            {settledLocks.length === 0 ? (
              <div className="p-space-lg text-center text-on-surface-variant">No settled locks</div>
            ) : settledLocks.map(escrow => (
              <div key={escrow.id} className="bg-surface-container p-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md shadow-sm">
                <div className="flex flex-col gap-1 min-w-[260px]">
                  <div className="flex items-center gap-space-sm">
                    <span className={`px-space-xs py-0.5 font-mono-label-xs text-mono-label-xs uppercase ${
                      escrow.state === 'RELEASED' ? 'bg-surface-container-high text-primary-fixed' :
                      escrow.state === 'REFUND_NOHIT' || escrow.state === 'INSUFFICIENT' ? 'bg-error-container text-on-error-container' :
                      'bg-surface-container-highest text-on-surface-variant'
                    }`}>{escrow.state}</span>
                  </div>
                  <span className="font-headline-sm text-headline-sm text-primary mt-1">
                    <Link className="hover:text-primary-fixed" href={`/escrow/${escrow.id}`}>{escrow.pkg}</Link> @ {escrow.ver}
                  </span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">{escrow.statusMsg}</span>
                </div>
                <div className="flex flex-col md:items-center gap-0.5">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">FUNDER ROLE</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface">{escrow.funder.toLowerCase() === address?.toLowerCase() ? 'Funded by You' : 'Funded by Other'}</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">Verified on {escrow.registry}</span>
                </div>
                <div className="flex flex-col md:items-end gap-0.5">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">VALUE DELIVERED</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono-metric-md text-mono-metric-md text-primary">{formatEther(escrow.amount)}</span>
                    <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">TEST GEN</span>
                  </div>
                  <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed font-mono">ID: {escrow.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ==================== TAB 3: FALLBACK CREDITS & WITHDRAWALS ==================== */}
        {activeTab === 'credits' && (
          <div className="flex flex-col gap-space-md">
            <div className="bg-surface-container-high p-space-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
              <div className="flex flex-col gap-1 max-w-2xl">
                <div className="flex items-center gap-space-xs text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase">
                  <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                  <span>WHY DO FALLBACK CREDITS EXIST?</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm text-primary">Deterministic Pull-Credit Isolation</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Under GenLayer smart contracts, if an automated <code className="text-on-surface">emit_transfer</code> execution is constrained (e.g. gas limit mismatch, recipient fallback refusal, or insufficient oracle quorum), the escrow principal is automatically credited to the internal contract pull-balance to guarantee funds are never trapped.
                </p>
              </div>
              <div className="bg-surface-container-lowest p-space-md flex flex-col gap-1 min-w-[220px]">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">AVAILABLE FOR PULL</span>
                <span className="font-mono-metric-lg text-mono-metric-lg text-primary-fixed">
                  {formatEther(credit)} GEN
                </span>
                <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">Immediate execution</span>
              </div>
            </div>

            <div className="bg-surface-container p-space-md flex flex-col gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">
                OUTSTANDING PULL CLAIMS ({credit === 0n ? "0 ITEMS" : "1 ITEM"})
              </span>
              
              {credit > 0n ? (
                <div className="bg-surface-container-low p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-space-xs py-0.5 bg-surface-container-highest text-outline font-mono-label-xs text-mono-label-xs uppercase">CREDIT ACCOUNT</span>
                      <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed font-mono">WALLET: {address}</span>
                    </div>
                    <span className="font-headline-sm text-headline-sm text-primary">Pull-enabled</span>
                    <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">Execute withdraw to transfer to your account.</span>
                  </div>
                  <div className="flex flex-col sm:items-end gap-space-xs">
                    <span className="font-mono-metric-md text-mono-metric-md text-primary">{formatEther(credit)} TEST GEN</span>
                    <button 
                      className="px-space-md py-space-xs bg-primary-container text-on-primary-container font-mono-data-sm text-mono-data-sm font-bold uppercase hover:bg-primary transition-colors disabled:opacity-50" 
                      onClick={executeWithdraw}
                      disabled={isWithdrawing}
                    >
                      WITHDRAW THIS CREDIT
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-surface-container-low p-space-md text-on-surface-variant font-mono-data-sm text-mono-data-sm text-center">
                  No outstanding fallback credits.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: EMPTY / INACTIVE STATE ARCHETYPE ==================== */}
        {activeTab === 'inactive' && (
          <div className="flex flex-col gap-space-md">
            <div className="bg-surface-container-low p-space-xl flex flex-col items-center justify-center text-center gap-space-md py-20 shadow-sm">
              <div className="w-16 h-16 bg-surface-container-highest flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-[32px]">folder_off</span>
              </div>
              <div className="flex flex-col gap-space-xs max-w-md">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-widest">[NULL STATE // NO ACTIVE CONTRACTS]</span>
                <h3 className="font-headline-md text-headline-md text-primary">No Active Locks for Filter</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  This connected account currently holds zero locks matching this role or state criterion. When you fund a release window or register as a recipient, the deterministic escrow will instantiate here.
                </p>
              </div>
              <div className="flex items-center gap-space-sm pt-space-sm">
                <Link href="/lock" className="px-space-md py-space-sm bg-primary-container text-on-primary-container font-mono-data-sm text-mono-data-sm font-bold uppercase hover:bg-primary transition-colors">
                  CREATE NEW LOCK ESCROW
                </Link>
                <button 
                  className="px-space-md py-space-sm bg-surface-container-high text-on-surface font-mono-data-sm text-mono-data-sm uppercase hover:bg-surface-container-highest transition-colors" 
                  onClick={() => setActiveTab('open')}
                >
                  RETURN TO OPEN LOCKS
                </button>
              </div>
            </div>

            <div className="bg-surface-container p-space-md flex items-center justify-between text-outline font-mono-label-xs text-mono-label-xs">
              <span>ARCHITECTURAL NOTE: EMPTY STATE DEMONSTRATES DETERMINISTIC NULL PATTERNS ON ZERO QUERY HITS.</span>
              <span>CODE: 0x00_EMPTY</span>
            </div>
          </div>
        )}
      </div>
      {actionIntent && (
        <ActionModal 
          escrowId={actionIntent.id} 
          action={actionIntent.action} 
          onClose={() => {
            setActionIntent(null);
            setBusyId(null);
          }} 
          onSuccess={() => {
            setActionIntent(null);
            setBusyId(null);
            load();
          }} 
        />
      )}
    </div>
  );
}
