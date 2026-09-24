/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { client } from "@/lib/contract";
import { writeIc } from "@/lib/write";
import { formatEther } from "viem";
import { ActionModal } from "@/components/ActionModal";

export default function BrowseEscrows() {
  const { address, selectedProvider } = useWallet();
  const [registryFilter, setRegistryFilter] = useState("ALL");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [now, setNow] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionIntent, setActionIntent] = useState<{id: string, action: string} | null>(null);

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
    } catch (e) {
      console.error("Error loading escrows", e);
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
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return e.pkg.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.recipient.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full text-on-surface">
      {/* Asymmetric Industrial Header / Marquee Metric Strip */}
      <section className="w-full bg-surface-container-lowest">
        <div className="w-full px-margin-sm md:px-margin py-space-xl flex flex-col gap-space-lg">
          <div className="flex flex-wrap items-center justify-between gap-space-sm font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-widest">
            <div className="flex items-center gap-space-xs">
              <span className="text-primary-container font-bold">● TERMINAL ACTIVE</span>
              <span>// CAD_REGISTER_INDEX: 0x4B_EXPLORER</span>
              <span className="text-on-surface-variant">// QUORUM: 5/5 ORACLES SYNCED</span>
            </div>
            <div className="flex items-center gap-space-md">
              <span className="text-on-surface-variant">CHAIN: <span className="text-on-surface">61997</span></span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
            <div className="lg:col-span-8 flex flex-col justify-between gap-space-lg bg-surface-container-low p-space-lg md:p-space-xl">
              <div className="flex flex-col gap-space-sm">
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-widest">[REGISTRY TELEMETRY SUITE]</span>
                <h1 className="font-display-lg text-display-lg text-primary max-w-2xl leading-[1.05]">
                  Autonomous release locks, <span className="italic font-normal text-on-surface-variant">indexed and verifiable.</span>
                </h1>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md pt-space-md bg-surface-container p-space-md">
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">AGGREGATE ESCROW</span>
                  <span className="font-mono-metric-md text-mono-metric-md text-primary mt-1">{formatEther(stats.totalAmount)} <span className="text-primary-fixed font-mono-label-xs">GEN</span></span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-0.5">{stats.totalCommitments} Total Commitments</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">READY TO TRIGGER</span>
                  <span className="font-mono-metric-md text-mono-metric-md text-primary-container mt-1">{stats.open.toString().padStart(2, '0')} LOCK{stats.open !== 1 ? 'S' : ''}</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-0.5">{formatEther(stats.openAmount)} GEN Ripe Volume</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">SETTLEMENT SLA</span>
                  <span className="font-mono-metric-md text-mono-metric-md text-on-surface mt-1">&lt; 0.8s</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-0.5">Instant Oracle Resolution</span>
                </div>
              </div>
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
                Any connected wallet can call contract execution on ripe escrows once window conditions hit PyPI or npm official feeds. Gas refunds apply.
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
              <span className="absolute right-space-md font-mono-label-xs text-mono-label-xs text-outline hidden sm:block">ESC_QUERY // [CTRL+K]</span>
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
            ].map(state => (
              <button 
                key={state.id}
                onClick={() => setStateFilter(state.id)}
                className={`px-space-sm py-1 uppercase transition-colors whitespace-nowrap ${stateFilter === state.id ? `bg-surface-bright font-bold ${state.colorClass}` : `bg-surface-container-lowest hover:bg-surface-bright ${state.colorClass}`}`}
              >
                {state.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED CARD STRIP */}
      {featured && (
      <section className="w-full bg-surface-container-lowest py-space-xl">
        <div className="w-full px-margin-sm md:px-margin flex flex-col gap-space-md">
          <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant">
            <div className="flex items-center gap-space-sm">
              <span className="bg-primary-container text-on-primary-container px-1.5 py-0.5 font-bold">01 // ACTION REQUIRED</span>
              <span className="text-primary font-medium tracking-wider">MATURED PERMISSIONLESS SETTLEMENT CORRIDOR</span>
            </div>
            <span className="text-outline">SLOT_STATUS: 1 READY</span>
          </div>

          <div className="relative w-full bg-surface-container-high p-space-lg md:p-space-xl shadow-xl flex flex-col lg:flex-row items-stretch justify-between gap-space-xl overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-primary-fixed"></div>
            
            <div className="flex flex-col justify-between gap-space-lg flex-1 pl-space-xs">
              <div className="flex flex-col gap-space-xs">
                <div className="flex flex-wrap items-center gap-space-sm">
                  <span className="font-mono-label-xs text-mono-label-xs px-2.5 py-1 bg-primary-container text-on-primary-container font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-on-primary-fixed animate-ping"></span>
                    {now >= featured.start ? 'OPEN (RIPE) // READY FOR RELEASE' : 'OPEN // PRE-MATURITY'}
                  </span>
                  <span className="font-mono-label-xs text-mono-label-xs px-2 py-1 bg-surface-container text-on-surface uppercase flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-primary-fixed">{featured.registry === 'NPM' ? 'inventory_2' : 'terminal'}</span>
                    {featured.registry === 'NPM' ? 'npm (Node.js)' : 'PyPI (Python)'}
                  </span>
                  <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed-dim bg-surface-container-low px-2 py-1">
                    FEED VERIFIED: {featured.registry === 'NPM' ? 'npmjs.com/package/' : 'pypi.org/pypi/'}{featured.pkg}/json
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-baseline gap-space-sm mt-2">
                  <h2 className="font-headline-lg text-headline-lg text-primary hover:text-primary-fixed transition-colors cursor-pointer">
                    <Link href={`/escrow/${featured.id}`}>{featured.pkg}</Link> <span className="font-headline-md text-headline-md text-primary-fixed">@ {featured.ver}</span>
                  </h2>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
                  Strict typed RPC serialization schema over HTTP XML endpoints. Contract is active.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-md pt-space-sm bg-surface-container-low p-space-md">
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">ESCROW HASH ID</span>
                  <div className="flex items-center gap-1 text-primary mt-1 font-mono-data-sm text-mono-data-sm">
                    <span>{featured.id.slice(0,6)}...{featured.id.slice(-4)}</span>
                    <button className="hover:text-primary-fixed transition-colors" title="Copy Escrow Hash" onClick={() => navigator.clipboard.writeText(featured.id)}>
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">WINDOW MATURED</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-primary-fixed mt-1">{featured.window}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">FUNDER</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-1">{featured.funder.slice(0,6)}...{featured.funder.slice(-4)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">RECIPIENT</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-primary-fixed mt-1">{featured.recipient.slice(0,6)}...{featured.recipient.slice(-4)}</span>
                </div>
              </div>
            </div>

            <div className="lg:w-96 flex flex-col justify-between bg-surface-container p-space-md gap-space-md">
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between text-outline font-mono-label-xs text-mono-label-xs uppercase">
                  <span>LOCKED SETTLEMENT POOL</span>
                  <span className="text-primary-fixed font-bold">100% FUNDED</span>
                </div>
                <div className="flex items-baseline gap-space-xs mt-1">
                  <span className="font-mono-metric-lg text-mono-metric-lg text-primary font-bold">{formatEther(featured.amount)}</span>
                  <span className="font-headline-sm text-headline-sm text-primary-fixed">GEN</span>
                </div>
              </div>
              <div className="flex flex-col gap-space-xs">
                {renderActionButtons(featured) || (
                  <button className="w-full py-2 bg-surface-container-low text-outline font-mono-label-xs text-mono-label-xs uppercase cursor-not-allowed flex items-center justify-center gap-1 opacity-60" disabled>
                    <span className="material-symbols-outlined text-[14px]">lock</span>
                    <span>No Action</span>
                  </button>
                )}
                <span className="font-mono-label-xs text-mono-label-xs text-outline text-center mt-2">
                  PERMISSIONLESS EXECUTION // NO SLIPPAGE // INSTANT ROUTE
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

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
                      <span className="px-2 py-0.5 bg-surface-container-highest text-on-surface uppercase flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">{escrow.registry === 'NPM' ? 'inventory_2' : 'code'}</span> {escrow.registry === 'NPM' ? 'npm (Node.js)' : 'PyPI (Python)'}
                      </span>
                      <span className="text-on-surface-variant ml-auto flex items-center gap-1">
                        <span>{escrow.id}</span>
                        <button className="hover:text-primary-fixed" title="Copy Hash" onClick={() => navigator.clipboard.writeText(escrow.id)}><span className="material-symbols-outlined text-[13px]">content_copy</span></button>
                      </span>
                    </div>
                    <div className="flex items-baseline gap-space-sm mt-1">
                      <h3 className="font-headline-sm text-headline-sm text-primary hover:text-primary-fixed transition-colors cursor-pointer">
                        <Link href={`/escrow/${escrow.id}`}>{escrow.pkg}</Link> <span className="text-on-surface-variant font-mono-data-sm text-mono-data-sm">@ {escrow.ver}</span>
                      </h3>
                    </div>
                    <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                      {escrow.desc}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm pt-space-xs text-on-surface-variant font-mono-data-sm text-mono-data-sm">
                    <div>
                      <span className="text-outline uppercase font-mono-label-xs text-mono-label-xs block">{escrow.isRefund ? 'FUNDER (REFUNDED)' : 'FUNDER'}</span>
                      <span className="text-on-surface" title={escrow.funder}>{escrow.funder.slice(0, 10)}...</span>
                    </div>
                    <div>
                      <span className="text-outline uppercase font-mono-label-xs text-mono-label-xs block">{escrow.isRefund ? 'TARGET BENEFICIARY' : escrow.state === 'OPEN' ? 'AUTHORIZED BENEFICIARY' : 'RECIPIENT (PAID)'}</span>
                      <span className={escrow.isRefund && escrow.state !== 'CANCELED' ? 'text-on-surface-variant line-through' : escrow.state === 'RELEASED' ? 'text-primary-fixed' : 'text-on-surface'} title={escrow.recipient}>{escrow.recipient.slice(0, 10)}...</span>
                    </div>
                    <div>
                      <span className="text-outline uppercase font-mono-label-xs text-mono-label-xs block">
                        {escrow.state === 'RELEASED' ? 'RELEASE WINDOW' :
                         escrow.state === 'REFUND_NOHIT' ? 'WINDOW EXPIRED' :
                         escrow.state === 'CANCELED' ? 'SETTLEMENT TYPE' :
                         'WINDOW UNLOCKS IN'}
                      </span>
                      <span className={escrow.state === 'REFUND_NOHIT' ? 'text-error' : escrow.state === 'OPEN' ? 'text-primary-fixed font-bold' : 'text-on-surface'}>
                        {escrow.window}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="lg:w-72 bg-surface-container p-space-md flex flex-col justify-between gap-space-sm items-end text-right">
                  <div className="flex flex-col items-end w-full">
                    <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">{escrow.isRefund ? 'RESTORED CAPITAL' : escrow.state === 'OPEN' ? 'ESCROW DEPOSIT' : 'SETTLED AMOUNT'}</span>
                    <span className={`font-mono-metric-md text-mono-metric-md font-bold ${
                      escrow.state === 'RELEASED' ? 'text-primary' :
                      escrow.state === 'REFUND_NOHIT' ? 'text-error' :
                      escrow.state === 'CANCELED' ? 'text-on-surface' :
                      'text-primary'
                    }`}>{formatEther(escrow.amount)} <span className="text-on-surface-variant font-mono-label-xs">GEN</span></span>
                    <span className={`font-mono-label-xs text-mono-label-xs mt-1 ${escrow.state === 'RELEASED' ? 'text-primary-fixed' : 'text-on-surface-variant'}`}>{escrow.statusMsg}</span>
                  </div>
                  
                  <div className="w-full mt-2">
                    {renderActionButtons(escrow) || (
                      <button className="w-full py-2 bg-surface-container-high text-outline font-mono-label-xs text-mono-label-xs uppercase cursor-not-allowed flex items-center justify-center gap-1 opacity-60" disabled>
                        <span className="material-symbols-outlined text-[14px]">lock</span>
                        <span>No Action</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
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
