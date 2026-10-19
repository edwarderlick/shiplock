/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { client } from "@/lib/contract";
import { formatEther } from "viem";
import { ActionModal } from "@/components/ActionModal";
import { CONTRACT_ADDRESS, IS_CONTRACT_ADDRESS_VALID } from "@/lib/env";

export default function BrowseEscrows() {
  const { address } = useWallet();
  const [registryFilter, setRegistryFilter] = useState("ALL");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [now, setNow] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionIntent, setActionIntent] = useState<{id: string, action: string} | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [escrows, setEscrows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalAmount: 0n,
    totalCommitments: 0,
    open: 0,
    released: 0,
    openAmount: 0n,
    refundNohit: 0,
    canceled: 0,
    expired: 0
  });

  const load = async () => {
    if (!IS_CONTRACT_ADDRESS_VALID || !CONTRACT_ADDRESS) {
      setLoadError("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured or invalid.");
      return;
    }
    setLoadError(null);
    try {
      const ids = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_escrow_ids",
        args: []
      }) as string[];
      
      const loaded = await Promise.all(ids.map(async (id: string) => {
        const e = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: "get_escrow",
          args: [id]
        }) as any;
        return {
          id: e.id || id,
          registry: e.template === "NPM_VERSION" ? "NPM" : "PYPI",
          policy: e.policy || "REGISTRY_ONLY",
          expectedRepo: e.expected_repo || "",
          expectedTag: e.expected_tag || "",
          state: e.status,
          pkg: e.package_name,
          ver: e.version,
          desc: `Window: ${e.window_start_utc} to ${e.window_end_utc}`,
          funder: e.funder,
          recipient: e.recipient,
          window: e.status === 'OPEN' ? e.window_end_utc : 'Closed',
          amount: BigInt(e.amount),
          statusMsg: e.status,
          matchReason: e.match_reason || "",
          isRefund: e.status !== "OPEN" && e.status !== "RELEASED",
          start: new Date(e.window_start_utc).getTime(),
          expire: new Date(e.expire_at_utc).getTime(),
        };
      }));
      setEscrows(loaded);
      
      let totalAmount = 0n;
      let openAmount = 0n;
      let open = 0, released = 0, refundNohit = 0, canceled = 0, expired = 0;
      
      for (const e of loaded) {
        totalAmount += e.amount;
        if (e.state === "OPEN") {
          open++;
          openAmount += e.amount;
        } else if (e.state === "RELEASED") {
          released++;
        } else if (e.state === "REFUND_NOHIT") {
          refundNohit++;
        } else if (e.state === "CANCELED") {
          canceled++;
        } else if (e.state === "EXPIRED") {
          expired++;
        }
      }
      
      setStats({
        totalAmount,
        totalCommitments: loaded.length,
        open,
        released,
        openAmount,
        refundNohit,
        canceled,
        expired
      });
    } catch (e: any) {
      console.error("Error loading escrows", e);
      setLoadError(e?.message || "Failed to load escrows");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const executeAction = async (id: string, functionName: string) => {
    if (!address) {
      alert("Please connect wallet first");
      return;
    }
    if (busyId === id) return;
    setBusyId(id);
    setActionIntent({ id, action: functionName });
  };

  const featured = escrows.find(e => e.state === "OPEN");

  const renderActionButtons = (escrow: any) => {
    const isOpen = escrow.state === 'OPEN';
    if (!isOpen) return null;

    const isFunder = address && address.toLowerCase() === escrow.funder.toLowerCase();
    
    if (now < escrow.start && isFunder) {
      return (
        <button 
          onClick={() => executeAction(escrow.id, "cancel")}
          disabled={busyId === escrow.id}
          className="w-full py-2 bg-error hover:bg-on-error hover:text-error text-on-error font-mono-label-xs text-mono-label-xs uppercase font-bold tracking-wider transition-all flex items-center justify-center gap-1 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]">cancel</span>
          <span>{busyId === escrow.id ? 'CANCELLING...' : 'Cancel'}</span>
        </button>
      );
    } else if (now >= escrow.start && now < escrow.expire && !isFunder) {
      return (
        <button 
          onClick={() => executeAction(escrow.id, "release")}
          disabled={busyId === escrow.id}
          className="w-full py-2 bg-primary-container hover:bg-primary text-on-primary-container font-mono-label-xs text-mono-label-xs uppercase transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]">play_arrow</span>
          <span>{busyId === escrow.id ? 'RELEASING...' : 'Release'}</span>
        </button>
      );
    } else if (now >= escrow.expire) {
      return (
        <button 
          onClick={() => executeAction(escrow.id, "expire")}
          disabled={busyId === escrow.id}
          className="w-full py-2 bg-secondary hover:bg-secondary-container text-on-secondary font-mono-label-xs text-mono-label-xs uppercase transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]">timer_off</span>
          <span>{busyId === escrow.id ? 'EXPIRING...' : 'Expire'}</span>
        </button>
      );
    }
    
    return null;
  };

  const filteredEscrows = escrows.filter(e => {
    if (registryFilter !== "ALL" && e.registry !== registryFilter) return false;
    if (stateFilter !== "ALL" && e.state !== stateFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchPkg = e.pkg.toLowerCase().includes(q);
      const matchId = e.id.toLowerCase().includes(q);
      const matchRec = e.recipient.toLowerCase().includes(q);
      const matchFun = e.funder.toLowerCase().includes(q);
      if (!matchPkg && !matchId && !matchRec && !matchFun) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full text-on-surface">
      {/* Configuration Error Banner */}
      {loadError && (
        <div className="w-full bg-error-container text-on-error-container px-margin-sm md:px-margin py-space-sm font-mono-data-sm text-[12px] flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>CONTRACT ERROR: {loadError}</span>
          </div>
          <span className="font-mono text-[11px]">Check NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local</span>
        </div>
      )}

      {/* TOP CAD INDEX HEADER */}
      <section className="w-full bg-surface border-b border-outline/10 py-space-xl">
        <div className="w-full px-margin-sm md:px-margin flex flex-col gap-space-lg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
            <div className="flex flex-col max-w-2xl gap-space-xs">
              <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">
                <span className="text-primary-fixed">[REGISTRY_EXPLORER]</span>
                <span>{"//"}</span>
                <span>ESCROW ARCHIVE</span>
                <span>{"//"}</span>
                <span className="text-secondary truncate max-w-[150px]" title={CONTRACT_ADDRESS}>
                  {CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}` : "NOT WIRED"}
                </span>
              </div>
              <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-primary tracking-tight font-normal">
                Autonomous Escrow Registry
              </h1>
              <p className="font-body-lg text-body-lg text-secondary">
                Inspect public commitments conditioned on PyPI and npm package delivery. Anyone can trigger settlement once release conditions are met.
              </p>
            </div>

            <div className="lg:col-span-4 bg-primary-container text-on-primary-container p-space-lg flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase tracking-widest font-bold text-on-primary-fixed">PROTOCOL DIRECTIVE</span>
                  <span className="font-headline-sm text-headline-sm uppercase font-bold mt-1 text-on-primary-fixed">Permissionless Settlement</span>
                </div>
                <span className="material-symbols-outlined text-3xl text-on-primary-fixed">bolt</span>
              </div>
              <p className="font-body-md text-body-md text-on-primary-fixed-variant leading-relaxed my-space-md">
                Any connected wallet can call contract execution on ripe escrows once window conditions hit PyPI or npm official feeds.
              </p>
              <div className="flex items-center justify-between pt-space-sm">
                <span className="font-mono-data-sm text-mono-data-sm font-semibold text-on-primary-fixed">GENLAYER_DEVNET // 61997</span>
                <span className="font-mono-label-xs text-mono-label-xs bg-on-primary-fixed text-primary-fixed px-2 py-1 uppercase font-bold tracking-wider">LIVE ORACLE</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter & Operational Controls Bar */}
      <section className="w-full bg-surface-container py-space-md">
        <div className="w-full px-margin-sm md:px-margin flex flex-col gap-space-md">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center">
            <div className="md:col-span-8 relative flex items-center bg-surface-container-lowest">
              <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[20px]">search</span>
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full py-space-sm pl-12 pr-space-md bg-transparent text-primary placeholder-on-surface-variant font-mono-data-sm text-mono-data-sm focus:outline-none focus:bg-surface-container-high transition-colors" 
                placeholder="FILTER BY PACKAGE NAME, HASH ID (0x...), OR RECIPIENT..." 
                type="text"
              />
            </div>
            
            <div className="md:col-span-4 flex items-center bg-surface-container-lowest p-1 gap-1">
              {['ALL', 'PYPI', 'NPM'].map((reg) => (
                <button 
                  key={reg}
                  onClick={() => setRegistryFilter(reg)}
                  className={`flex-1 py-space-xs font-mono-label-xs text-mono-label-xs uppercase text-center transition-colors ${registryFilter === reg ? 'bg-primary-container text-on-primary-container font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  {reg === 'ALL' ? 'All Feeds' : reg === 'PYPI' ? 'PyPI (Python)' : 'npm (Node.js)'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-space-xs overflow-x-auto pb-1 scrollbar-none font-mono-label-xs text-mono-label-xs">
            <span className="text-outline uppercase mr-2 tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">tune</span> STATE:
            </span>
            {[
              { id: 'ALL', label: `All (${stats.totalCommitments})`, colorClass: 'text-primary' },
              { id: 'OPEN', label: `OPEN (${stats.open})`, colorClass: 'text-primary-container' },
              { id: 'RELEASED', label: `RELEASED (${stats.released})`, colorClass: 'text-on-surface-variant' },
              { id: 'REFUND_NOHIT', label: `REFUND_NOHIT (${stats.refundNohit})`, colorClass: 'text-error' },
              { id: 'CANCELED', label: `CANCELED (${stats.canceled})`, colorClass: 'text-on-surface-variant' },
              { id: 'EXPIRED', label: `EXPIRED (${stats.expired})`, colorClass: 'text-on-surface-variant' }
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStateFilter(st.id)}
                className={`px-3 py-1.5 whitespace-nowrap transition-colors uppercase ${
                  stateFilter === st.id 
                    ? 'bg-primary-container text-on-primary-container font-bold shadow-sm' 
                    : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ESCROW REPOSITORY ARCHIVE / FEED SECTION */}
      <section className="w-full bg-surface py-space-xl">
        <div className="w-full px-margin-sm md:px-margin flex flex-col gap-space-lg">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-sm pb-space-sm">
            <div className="flex flex-col gap-1">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">[INDEXER QUERY: RECENT_CONTRACTS]</span>
              <h2 className="font-headline-md text-headline-md text-primary">All Tracked Verification Escrows</h2>
            </div>
            <div className="flex items-center gap-space-md font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <span>SHOWING <span className="text-primary font-bold">{filteredEscrows.length} OF {stats.totalCommitments}</span> CONTRACTS</span>
              <span className="text-outline">|</span>
              <span className="flex items-center gap-1 text-primary-fixed"><span className="w-2 h-2 rounded-full bg-primary-fixed inline-block"></span> REFRESHING REAL-TIME</span>
            </div>
          </div>

          <div className="flex flex-col gap-space-md">
            {filteredEscrows.map((escrow) => (
              <article key={escrow.id} className="bg-surface-container-low hover:bg-surface-container p-space-md md:p-space-lg transition-colors flex flex-col lg:flex-row items-stretch justify-between gap-space-lg">
                <div className="flex flex-col justify-between gap-space-md flex-1">
                  <div className="flex flex-col gap-space-xs">
                    <div className="flex flex-wrap items-center gap-space-xs font-mono-label-xs text-mono-label-xs">
                      <span className={`px-2 py-0.5 font-bold tracking-wider uppercase ${
                        escrow.state === 'RELEASED' ? 'bg-surface-container text-primary-fixed' :
                        escrow.state === 'REFUND_NOHIT' ? 'bg-error-container text-on-error-container' :
                        escrow.state === 'OPEN' ? 'bg-surface-container text-primary-fixed-dim' :
                        'bg-surface-container-highest text-on-surface-variant'
                      }`}>
                        {escrow.state}
                      </span>
                      {escrow.matchReason && escrow.state === 'OPEN' && (
                        <span className="px-2 py-0.5 bg-secondary-container/20 text-secondary text-[10px] font-mono">
                          {escrow.matchReason}
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-surface-container-highest text-on-surface uppercase flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">{escrow.registry === 'NPM' ? 'inventory_2' : 'code'}</span> {escrow.registry === 'NPM' ? 'npm (Node.js)' : 'PyPI (Python)'}
                      </span>
                      {escrow.policy === 'SOURCE_LINKED' && (
                        <span className="px-2 py-0.5 bg-primary-fixed/20 text-primary-fixed text-[10px] font-mono font-bold uppercase border border-primary-fixed/30">
                          SOURCE-LINKED v2
                        </span>
                      )}
                      <span className="text-on-surface-variant ml-auto flex items-center gap-1">
                        <span className="font-mono text-[11px] truncate max-w-[120px]">{escrow.id}</span>
                        <button className="hover:text-primary-fixed" title="Copy Hash" onClick={() => navigator.clipboard.writeText(escrow.id)}><span className="material-symbols-outlined text-[13px]">content_copy</span></button>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-space-sm mt-1">
                      <h3 className="font-headline-sm text-headline-sm text-primary hover:text-primary-fixed transition-colors cursor-pointer">
                        <Link href={`/escrow/${escrow.id}`}>{escrow.pkg}</Link> <span className="text-on-surface-variant font-mono-data-sm text-mono-data-sm">@ {escrow.ver}</span>
                      </h3>
                      {escrow.policy === 'SOURCE_LINKED' && escrow.expectedRepo && (
                        <span className="font-mono text-[11px] text-primary-fixed bg-surface-container px-2 py-0.5">
                          GitHub: {escrow.expectedRepo}@{escrow.expectedTag}
                        </span>
                      )}
                    </div>
                    <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                      {escrow.desc}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm pt-space-xs text-on-surface-variant font-mono-data-sm text-mono-data-sm">
                    <div>
                      <span className="text-outline uppercase font-mono-label-xs text-mono-label-xs block">{escrow.isRefund ? 'FUNDER (REFUNDED)' : 'FUNDER'}</span>
                      <span className="text-on-surface font-mono text-[12px]" title={escrow.funder}>{escrow.funder.slice(0, 10)}...</span>
                    </div>
                    <div>
                      <span className="text-outline uppercase font-mono-label-xs text-mono-label-xs block">{escrow.isRefund ? 'TARGET BENEFICIARY' : escrow.state === 'OPEN' ? 'AUTHORIZED BENEFICIARY' : 'RECIPIENT (PAID)'}</span>
                      <span className={escrow.isRefund && escrow.state !== 'CANCELED' ? 'text-on-surface-variant line-through font-mono text-[12px]' : escrow.state === 'RELEASED' ? 'text-primary-fixed font-mono text-[12px]' : 'text-on-surface font-mono text-[12px]'} title={escrow.recipient}>{escrow.recipient.slice(0, 10)}...</span>
                    </div>
                    <div>
                      <span className="text-outline uppercase font-mono-label-xs text-mono-label-xs block">
                        {escrow.state === 'RELEASED' ? 'RELEASE WINDOW' :
                         escrow.state === 'REFUND_NOHIT' ? 'WINDOW EXPIRED' :
                         escrow.state === 'CANCELED' ? 'SETTLEMENT TYPE' :
                         'WINDOW END (UTC)'}
                      </span>
                      <span className={escrow.state === 'REFUND_NOHIT' ? 'text-error font-mono text-[12px]' : escrow.state === 'OPEN' ? 'text-primary-fixed font-mono text-[12px] font-bold' : 'text-on-surface font-mono text-[12px]'}>
                        {escrow.window}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="lg:w-72 flex flex-col justify-between items-end bg-surface-container p-space-md gap-space-md shrink-0">
                  <div className="flex flex-col items-end gap-0.5 w-full">
                    <span className="text-outline font-mono-label-xs text-mono-label-xs uppercase">PRINCIPAL ESCROW</span>
                    <div className="font-mono-metric-md text-mono-metric-md font-bold text-primary flex items-baseline gap-1">
                      <span>{formatEther(escrow.amount)}</span>
                      <span className="text-primary-fixed text-mono-label-xs font-mono">GEN</span>
                    </div>
                  </div>
                  <div className="w-full flex flex-col gap-space-xs">
                    <Link
                      href={`/escrow/${escrow.id}`}
                      className="w-full py-1.5 bg-surface-container-high hover:bg-surface-bright text-on-surface text-center font-mono-label-xs text-mono-label-xs uppercase transition-colors"
                    >
                      View Details
                    </Link>
                    {renderActionButtons(escrow)}
                  </div>
                </div>
              </article>
            ))}

            {filteredEscrows.length === 0 && (
              <div className="p-space-xl bg-surface-container text-center text-on-surface-variant font-mono-data-sm">
                NO ESCROWS FOUND MATCHING FILTER CRITERIA
              </div>
            )}
          </div>
        </div>
      </section>

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
