"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { client } from "@/lib/contract";
import { formatEther } from "viem";
import { ActionModal } from "@/components/ActionModal";
import { CONTRACT_ADDRESS, IS_CONTRACT_ADDRESS_VALID } from "@/lib/env";

export default function EscrowDetail() {
  const { id } = useParams();
  const { address } = useWallet();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionIntent, setActionIntent] = useState<{id: string, action: string} | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  const [escrow, setEscrow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const escrowId = id ? (Array.isArray(id) ? id[0] : id) : "";

  const load = async () => {
    if (!escrowId) return;
    if (!IS_CONTRACT_ADDRESS_VALID || !CONTRACT_ADDRESS) {
      setLoadError("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured or invalid.");
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      const e = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_escrow",
        args: [escrowId]
      }) as any;
      setEscrow({
        ...e,
        amountBig: BigInt(e.amount),
        start: new Date(e.window_start_utc).getTime(),
        windowEnd: new Date(e.window_end_utc).getTime(),
        expire: new Date(e.expire_at_utc).getTime()
      });
    } catch(err: any) {
      console.error(err);
      setLoadError(err?.message || "Failed to load escrow");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [escrowId]);
  
  const handleCopyHash = () => {
    if (escrowId) navigator.clipboard.writeText(escrowId);
  };

  const executeAction = (functionName: string) => {
    if (!address) {
      alert("Please connect wallet first");
      return;
    }
    if (busyId === escrowId) return;
    setBusyId(escrowId);
    setActionIntent({ id: escrowId, action: functionName });
  };

  if (loading) {
    return (
      <div className="p-margin text-on-surface font-mono-data-sm">
        Loading escrow {escrowId}...
      </div>
    );
  }

  if (loadError || !escrow) {
    return (
      <div className="p-margin flex flex-col gap-space-sm text-on-surface">
        <div className="text-error font-mono-data-sm font-bold">
          {loadError || "Escrow not found on-chain."}
        </div>
        <div className="text-on-surface-variant font-mono-data-sm text-[12px]">
          Target Contract: <span className="font-mono">{CONTRACT_ADDRESS || "NOT CONFIGURED"}</span>
        </div>
      </div>
    );
  }

  const isOpen = escrow.status === 'OPEN';
  const isFunder = address && address.toLowerCase() === escrow.funder.toLowerCase();
  
  const canCancel = isOpen && now < escrow.start && isFunder;
  const canRelease = isOpen && now >= escrow.start && now < escrow.expire && !isFunder;
  const canExpire = isOpen && now >= escrow.expire;
  const isRetryableOpen = isOpen && typeof escrow.match_reason === "string" && escrow.match_reason.includes("RETRYABLE");

  return (
    <div className="flex flex-col w-full text-on-surface">
      {/* TOP CONTEXT BANNER / INDUSTRIAL AUDIT STRIP */}
      <div className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-sm flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-md flex-wrap">
          <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs uppercase">
            <span className="text-primary-container font-semibold">[TX_REF]</span>
            <span className="text-on-surface select-all break-all">{escrowId}</span>
            <button 
              className="p-1 hover:text-primary-container text-on-surface-variant transition-colors flex items-center" 
              onClick={handleCopyHash}
              title="Copy Escrow ID"
            >
              <span className="material-symbols-outlined text-[14px]">content_copy</span>
            </button>
          </div>
          <span className="text-surface-container-highest hidden sm:inline">/</span>
          <div className="flex items-center gap-space-xs font-mono-data-sm text-mono-data-sm text-on-surface-variant">
            <span>CONTRACT:</span>
            <span className="text-secondary font-mono-data-sm truncate max-w-[150px]" title={CONTRACT_ADDRESS}>
              {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
            <span>INDEXER VERIFIED</span>
          </div>
          <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-container font-medium">GEN_61997</span>
        </div>
      </div>

      {/* RETRYABLE OPEN NOTICE BANNER */}
      {isRetryableOpen && (
        <div className="w-full bg-secondary-container/20 border-b border-secondary/40 px-margin-sm md:px-margin py-space-sm flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm font-mono-data-sm text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-secondary text-[18px]">sync</span>
            <span>
              <strong>Registry check complete, escrow still open — retry later</strong> (Reason: <code className="text-primary-fixed">{escrow.match_reason}</code>). The publication window remains active.
            </span>
          </div>
        </div>
      )}

      {/* SECTION 1: HEADER & TELEMETRY STRIP */}
      <section className="w-full bg-surface px-margin-sm md:px-margin py-space-xl">
        <div className="flex flex-col gap-space-lg">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
            {/* Left Status Block */}
            <div className="lg:col-span-3 bg-primary-container text-on-primary-container p-space-lg flex flex-col justify-between relative shadow-md">
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs tracking-wider uppercase font-bold text-on-primary-container">
                  <span>ESCROW STATUS</span>
                  <span>[ST-01]</span>
                </div>
                <div className="mt-space-sm inline-flex items-center gap-2 bg-on-primary text-primary-container px-3 py-1 font-mono-label-xs text-mono-label-xs font-bold tracking-widest uppercase w-fit">
                  <span className="w-2 h-2 rounded-full bg-primary-container"></span>
                  {escrow.status}
                </div>
                {escrow.match_reason && (
                  <div className="mt-2 text-[11px] font-mono opacity-90 break-all">
                    REASON: {escrow.match_reason}
                  </div>
                )}
              </div>
              <div className="mt-space-xl flex flex-col gap-space-xs">
                <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary-container tracking-wider">COMMITTED PRINCIPAL</span>
                <div className="font-mono-metric-lg text-mono-metric-lg leading-none font-bold text-on-primary-container">
                  {formatEther(escrow.amountBig)}
                </div>
                <div className="font-mono-data-sm text-mono-data-sm font-semibold tracking-tight text-on-primary-container flex items-center justify-between">
                  <span>GEN TESTNET</span>
                  <span>100% COLLATERAL</span>
                </div>
              </div>
            </div>

            {/* Right Editorial Title Chamber */}
            <div className="lg:col-span-9 bg-surface-container-low p-space-lg md:p-space-xl flex flex-col justify-between shadow-sm">
              <div className="flex flex-col gap-space-sm">
                <div className="flex flex-wrap items-center justify-between gap-space-sm">
                  <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs uppercase">
                    <span className="px-2 py-0.5 bg-surface-container-highest text-on-surface">{escrow.template}</span>
                    <span className="text-on-surface-variant font-mono-data-sm">REGISTRY TARGET SPEC</span>
                  </div>
                  <div className="font-mono-data-sm text-mono-data-sm text-on-surface-variant flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-primary-container">lock_clock</span>
                    <span>NONCE: <strong className="text-on-surface font-mono">{String(escrow.nonce ?? "0")}</strong></span>
                  </div>
                </div>
                {/* Headline */}
                <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface tracking-tight mt-space-sm">
                  {escrow.package_name} <span className="italic font-normal text-on-surface-variant">@ {escrow.version}</span>
                </h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
                  Autonomous programmatic bounty conditioned on the canonical package release timeline and checksum notarization.
                </p>
              </div>
              
              {/* Quick Stats CAD Ribbon - Distinct Dates */}
              <div className="mt-space-xl grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-space-sm bg-surface-container-lowest p-space-md">
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">WINDOW START</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-primary font-medium">{escrow.window_start_utc.replace('T', ' ').replace('Z', ' UTC')}</span>
                  <span className="text-[10px] text-outline">Lead-time opens</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">WINDOW END (NO-HIT REFUND)</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface font-medium">{escrow.window_end_utc.replace('T', ' ').replace('Z', ' UTC')}</span>
                  <span className="text-[10px] text-outline">No-hit refund boundary</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">SETTLEMENT DEADLINE (EXPIRES)</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-secondary font-medium">{escrow.expire_at_utc.replace('T', ' ').replace('Z', ' UTC')}</span>
                  <span className="text-[10px] text-outline">In-window settlement deadline</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">FUNDER</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-secondary truncate" title={escrow.funder}>{escrow.funder}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">RECIPIENT</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-primary-container truncate" title={escrow.recipient}>{escrow.recipient}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: STATUS & INTERACTION CONTROL CHAMBER */}
      <section className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-xl">
        <div className="flex flex-col gap-space-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs px-1.5 py-0.5 bg-surface-container text-primary-container uppercase font-bold">02</span>
              <h2 className="font-headline-sm text-headline-sm uppercase text-on-surface tracking-wider">Lifecycle &amp; Execution Protocol</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            {/* Left: Status Narrative */}
            <div className="lg:col-span-7 bg-surface-container p-space-lg md:p-space-xl flex flex-col justify-between shadow-sm">
              <div className="flex flex-col gap-space-md">
                <div className="flex items-center gap-space-sm text-primary-container">
                  <span className="material-symbols-outlined text-[24px]">hourglass_top</span>
                  <span className="font-mono-label-xs text-mono-label-xs uppercase font-bold tracking-widest">TIMELOCK STAGE</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-primary">
                  {now < escrow.start ? "Pre-Execution Window" : now < escrow.expire ? "Active Release Window" : "Expired / Settlement Required"}
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {now < escrow.start
                    ? `The escrow is currently in its lead-time lock until window start (${escrow.window_start_utc}). The funder may cancel before this time.`
                    : now < escrow.windowEnd
                    ? `The escrow is currently inside its publication window. A third-party observer or recipient may call release. If the package is not yet published or the registry is temporarily unavailable, the escrow remains OPEN and retryable without moving funds.`
                    : now < escrow.expire
                    ? `The publication window ended at ${escrow.window_end_utc}. An in-window publication can still be claimed until ${escrow.expire_at_utc}. Otherwise, calling release will finalize a REFUND_NOHIT back to the funder.`
                    : `The 7-day settlement grace period has expired (${escrow.expire_at_utc}). Anyone may call expire to return funds to the funder.`
                  }
                </p>
              </div>

              <div className="mt-space-lg bg-surface-container-low p-space-md flex items-start gap-space-sm">
                <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0 mt-0.5">verified_user</span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-primary font-bold">Consensus Rule Enforcement</span>
                  <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                    Release is permissionless for any observer, validator, or recipient — except the funder (<span className="text-on-surface">{escrow.funder.slice(0, 10)}...</span>) who cannot unilaterally trigger release.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="lg:col-span-5 bg-surface-container-low p-space-lg md:p-space-xl flex flex-col justify-between shadow-sm">
              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">AVAILABLE ACTIONS</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-primary-container">{isFunder ? '[AUTH: FUNDER_ACTIVE]' : '[AUTH: THIRD_PARTY]'}</span>
                </div>

                {/* Cancel Lock Trigger */}
                {canCancel && (
                  <div className="flex flex-col gap-space-xs bg-surface-container shadow-sm p-space-md">
                    <div className="flex items-center justify-between">
                      <span className="font-headline-sm text-headline-sm text-on-surface uppercase">Cancel Escrow</span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Allowed only before window start ({escrow.window_start_utc}) by the funder.
                    </p>
                    <button 
                      onClick={() => executeAction("cancel")}
                      disabled={busyId === escrowId}
                      className="mt-space-sm w-full py-3 px-4 bg-surface-bright hover:bg-error hover:text-on-error text-on-surface font-body-md text-body-md uppercase font-bold tracking-wider transition-all duration-150 flex items-center justify-center gap-space-sm cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">block</span>
                      <span>{busyId === escrowId ? "PROCESSING..." : "Execute Cancel"}</span>
                    </button>
                  </div>
                )}

                {/* Release Action */}
                {canRelease && (
                  <div className="flex flex-col gap-space-xs bg-surface-container shadow-sm p-space-md">
                    <div className="flex items-center justify-between">
                      <span className="font-headline-sm text-headline-sm text-on-surface uppercase">Trigger Release Check</span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Permissionless trigger. If published in-window, 100% is paid to recipient. If early check is 404 or registry unavailable, escrow remains OPEN and retryable.
                    </p>
                    <button 
                      onClick={() => executeAction("release")}
                      disabled={busyId === escrowId}
                      className="mt-space-sm w-full py-3 px-4 bg-primary-container hover:bg-primary text-on-primary-container font-body-md text-body-md uppercase font-bold tracking-wider transition-all duration-150 flex items-center justify-center gap-space-sm cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                      <span>{busyId === escrowId ? "PROCESSING..." : "Release / Check Registry"}</span>
                    </button>
                  </div>
                )}
                
                {/* Expire Action */}
                {canExpire && (
                  <div className="flex flex-col gap-space-xs bg-surface-container shadow-sm p-space-md">
                    <div className="flex items-center justify-between">
                      <span className="font-headline-sm text-headline-sm text-on-surface uppercase">Expire Escrow</span>
                    </div>
                    <button 
                      onClick={() => executeAction("expire")}
                      disabled={busyId === escrowId}
                      className="mt-space-sm w-full py-3 px-4 bg-secondary hover:bg-secondary-container text-on-secondary font-body-md text-body-md uppercase font-bold tracking-wider transition-all duration-150 flex items-center justify-center gap-space-sm cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">timer_off</span>
                      <span>{busyId === escrowId ? "PROCESSING..." : "Expire Escrow"}</span>
                    </button>
                  </div>
                )}

                {!canCancel && !canRelease && !canExpire && (
                  <div className="p-space-md bg-surface-container text-on-surface-variant font-mono-data-sm text-[12px]">
                    {isOpen 
                      ? isFunder 
                        ? "Escrow is active. Funders cannot trigger release. Non-funder observers may release once the window is open."
                        : "No execution actions currently available for your wallet under current window timing."
                      : `Escrow is settled with final state: ${escrow.status}. No further lifecycle transactions required.`
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: OFFICIAL REGISTRY FEED QUERY */}
      <section className="w-full bg-surface px-margin-sm md:px-margin py-space-xl">
        <div className="flex flex-col gap-space-lg">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-sm">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="font-mono-label-xs text-mono-label-xs px-1.5 py-0.5 bg-surface-container text-primary-container uppercase font-bold">03</span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-widest">[ORACLE ENGINE: DETERMINISTIC CONSENSUS]</span>
              </div>
              <h2 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">Constructed Registry Query</h2>
            </div>
            <div className="flex items-center gap-space-sm">
              <div className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span>OFFICIAL REGISTRY FEED</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
            <div className="lg:col-span-12 flex flex-col gap-space-md">
              <div className="bg-surface-container-lowest p-space-md md:p-space-lg shadow-sm">
                <div className="flex items-center justify-between pb-space-xs mb-space-sm">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">CANONICAL CONTRACT-BUILT ENDPOINT</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-primary-container">METHOD: HTTP_GET</span>
                </div>
                <div className="font-mono-data-sm text-mono-data-sm text-on-surface break-all bg-surface-container p-space-sm flex items-center justify-between gap-space-sm">
                  <code className="text-primary-fixed">{escrow.query_url || (escrow.template === "NPM_VERSION" ? `https://registry.npmjs.org/${escrow.package_name}` : `https://pypi.org/pypi/${escrow.package_name}/${escrow.version}/json`)}</code>
                  <button 
                    className="hover:text-primary-container text-on-surface-variant shrink-0" 
                    onClick={() => navigator.clipboard.writeText(escrow.query_url || "")} 
                    title="Copy Endpoint"
                  >
                    <span className="material-symbols-outlined text-[16px]">file_copy</span>
                  </button>
                </div>
                <p className="font-mono-label-xs text-mono-label-xs text-on-surface-variant mt-space-xs">
                  Queried directly by leaderless GenLayer consensus nodes. No intermediary centralized oracles or bridges.
                </p>
              </div>
            </div>
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
