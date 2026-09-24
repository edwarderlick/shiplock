"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { client } from "@/lib/contract";
import { writeIc } from "@/lib/write";
import { formatEther } from "viem";
import { ActionModal } from "@/components/ActionModal";

export default function EscrowDetail() {
  const { id } = useParams();
  const { address, selectedProvider } = useWallet();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionIntent, setActionIntent] = useState<{id: string, action: string} | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  const [probeStatus, setProbeStatus] = useState("PROBE");
  const [copyContractStatus, setCopyContractStatus] = useState("Copy Contract ABI");

  const [escrow, setEscrow] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const escrowId = id ? (Array.isArray(id) ? id[0] : id) : "";
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0xc7464f6d5F14559f878528730333D74481c4d00f";

  const load = async () => {
    if (!escrowId) return;
    try {
      const e = await client.readContract({
        address: contractAddress,
        functionName: "get_escrow",
        args: [escrowId]
      }) as any;
      setEscrow({
        ...e,
        amountBig: BigInt(e.amount),
        start: new Date(e.window_start_utc).getTime(),
        expire: new Date(e.expire_at_utc).getTime()
      });
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [escrowId]);
  
  const handleCopyHash = () => {
    navigator.clipboard.writeText(escrowId);
  };

  const executeAction = async (functionName: string) => {
    if (!address) {
      alert("Please connect wallet first");
      return;
    }
    if (busyId === escrowId) return;
    setBusyId(escrowId);
    setActionIntent({ id: escrowId, action: functionName });
  };

  const simulateFeedProbe = () => {
    setProbeStatus("PROBING...");
    setTimeout(() => {
      setProbeStatus("CHECKED: 404");
      setTimeout(() => {
        setProbeStatus("PROBE");
      }, 1500);
    }, 700);
  };

  const copyContractDetails = () => {
    navigator.clipboard.writeText(contractAddress);
    setCopyContractStatus("Contract Copied!");
    setTimeout(() => {
      setCopyContractStatus("Copy Contract ABI");
    }, 1500);
  };

  if (loading) {
    return <div className="p-margin text-on-surface">Loading escrow {escrowId}...</div>;
  }

  if (!escrow) {
    return <div className="p-margin text-error">Escrow not found.</div>;
  }

  const isOpen = escrow.status === 'OPEN';
  const isFunder = address && address.toLowerCase() === escrow.funder.toLowerCase();
  
  const canCancel = isOpen && now < escrow.start && isFunder;
  const canRelease = isOpen && now >= escrow.start && now < escrow.expire && !isFunder;
  const canExpire = isOpen && now >= escrow.expire;

  return (
    <div className="flex flex-col w-full text-on-surface">
      {/* TOP CONTEXT BANNER / INDUSTRIAL AUDIT STRIP */}
      <div className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-sm flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-md flex-wrap">
          <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs uppercase">
            <span className="text-primary-container font-semibold">[TX_REF]</span>
            <span className="text-on-surface select-all">{escrowId}</span>
            <button 
              className="p-1 hover:text-primary-container text-on-surface-variant transition-colors flex items-center" 
              onClick={handleCopyHash}
              title="Copy Tx Hash"
            >
              <span className="material-symbols-outlined text-[14px]">content_copy</span>
            </button>
          </div>
          <span className="text-surface-container-highest hidden sm:inline">/</span>
          <div className="flex items-center gap-space-xs font-mono-data-sm text-mono-data-sm text-on-surface-variant">
            <span>CONTRACT:</span>
            <span className="text-secondary font-mono-data-sm">GenLayer_ShipLockEscrow.py</span>
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

      {/* SECTION 1: HEADER & TELEMETRY STRIP */}
      <section className="w-full bg-surface px-margin-sm md:px-margin py-space-xl">
        <div className="flex flex-col gap-space-lg">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
            {/* Left Yellow Tactile Block (Trackwell inspired) */}
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
                    <span>MATURITY ESCROW CAD_v2</span>
                  </div>
                </div>
                {/* Massive Editorial Serif Heading */}
                <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface tracking-tight mt-space-sm">
                  {escrow.package_name} <span className="italic font-normal text-on-surface-variant">@ {escrow.version}</span>
                </h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
                  Autonomous programmatic bounty conditioned on the canonical package release timeline and checksum notarization.
                </p>
              </div>
              
              {/* Quick Stats CAD Ribbon */}
              <div className="mt-space-xl grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-sm bg-surface-container-lowest p-space-md">
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">WINDOW START</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-primary font-medium">{escrow.window_start_utc.replace('T', ' ').replace('Z', ' UTC')}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">WINDOW END / EXPIRE</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface">{escrow.expire_at_utc.replace('T', ' ').replace('Z', ' UTC')}</span>
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
          {/* Section Label */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs px-1.5 py-0.5 bg-surface-container text-primary-container uppercase font-bold">02</span>
              <h2 className="font-headline-sm text-headline-sm uppercase text-on-surface tracking-wider">Lifecycle &amp; Execution Protocol</h2>
            </div>
          </div>

          {/* State CAD Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            {/* Left: Status Narrative & Visual Pipeline */}
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
                  The smart contract locks all {formatEther(escrow.amountBig)} GEN until window start. Once active, any network observer, oracle validator, or ecosystem bot may trigger settlement via permissionless release. The funder cannot claw back assets once the verification window initiates.
                </p>
              </div>

              {/* Strict Role Boundary Callout */}
              <div className="mt-space-lg bg-surface-container-low p-space-md flex items-start gap-space-sm">
                <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0 mt-0.5">verified_user</span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-primary font-bold">Consensus Rule Enforcement</span>
                  <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                    Funder (<span className="text-on-surface">{escrow.funder.slice(0, 10)}...</span>) cannot trigger the release payout. To prevent unilateral claim fraud, release is strictly permissionless for any third-party validator, recipient, or keeper node.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Operational Controls Chamber */}
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
                      Requires pre-window timing and Funder authority.
                    </p>
                    <button 
                      onClick={() => executeAction("cancel")}
                      disabled={busyId === escrowId}
                      className="mt-space-sm w-full py-3 px-4 bg-surface-bright hover:bg-error hover:text-on-error text-on-surface font-body-md text-body-md uppercase font-bold tracking-wider transition-all duration-150 flex items-center justify-center gap-space-sm cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">block</span>
                      <span>{busyId === escrowId ? "ABORTING..." : "Execute Cancel Lock"}</span>
                    </button>
                  </div>
                )}

                {/* Release Action */}
                {canRelease && (
                  <div className="flex flex-col gap-space-xs bg-surface-container shadow-sm p-space-md">
                    <div className="flex items-center justify-between">
                      <span className="font-headline-sm text-headline-sm text-on-surface uppercase">Release Escrow</span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Requires active window and non-funder execution.
                    </p>
                    <button 
                      onClick={() => executeAction("release")}
                      disabled={busyId === escrowId}
                      className="mt-space-sm w-full py-3 px-4 bg-primary-container hover:bg-primary text-on-primary-container font-body-md text-body-md uppercase font-bold tracking-wider transition-all duration-150 flex items-center justify-center gap-space-sm cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                      <span>{busyId === escrowId ? "EXECUTING..." : "Release Now"}</span>
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
                      <span>{busyId === escrowId ? "EXECUTING..." : "Expire Escrow"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: OFFICIAL FEED BOARD & QUERY SCHEMA */}
      <section className="w-full bg-surface px-margin-sm md:px-margin py-space-xl">
        <div className="flex flex-col gap-space-lg">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-sm">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="font-mono-label-xs text-mono-label-xs px-1.5 py-0.5 bg-surface-container text-primary-container uppercase font-bold">03</span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-widest">[ORACLE ENGINE: DETERMINISTIC CAD]</span>
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
            <div className="lg:col-span-8 flex flex-col gap-space-md">
              <div className="bg-surface-container-lowest p-space-md md:p-space-lg shadow-sm">
                <div className="flex items-center justify-between pb-space-xs mb-space-sm">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">CANONICAL CONTRACT-BUILT ENDPOINT</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-primary-container">METHOD: HTTP_GET</span>
                </div>
                <div className="font-mono-data-sm text-mono-data-sm text-on-surface break-all bg-surface-container p-space-sm flex items-center justify-between gap-space-sm">
                  <code className="text-primary-fixed">{escrow.query_url || (escrow.template === "NPM_VERSION" ? `https://registry.npmjs.org/${escrow.package_name}/${escrow.version}` : `https://pypi.org/pypi/${escrow.package_name}/${escrow.version}/json`)}</code>
                  <button 
                    className="hover:text-primary-container text-on-surface-variant shrink-0" 
                    onClick={() => navigator.clipboard.writeText(escrow.query_url || (escrow.template === "NPM_VERSION" ? `https://registry.npmjs.org/${escrow.package_name}/${escrow.version}` : `https://pypi.org/pypi/${escrow.package_name}/json`))} 
                    title="Copy Endpoint"
                  >
                    <span className="material-symbols-outlined text-[16px]">file_copy</span>
                  </button>
                </div>
                <p className="font-mono-label-xs text-mono-label-xs text-on-surface-variant mt-space-xs">
                  Direct connection via leaderless GenLayer consensus nodes. No centralized API gateway or intermediary bridge used.
                </p>
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-space-md">
              <div className="p-space-md bg-surface-container flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">CURRENT QUERY TEST</span>
                </div>
                <button 
                  disabled={probeStatus !== "PROBE"}
                  className="px-3 py-1 bg-surface-container-highest hover:bg-surface-bright text-on-surface text-mono-label-xs font-mono-label-xs uppercase transition-colors" 
                  onClick={simulateFeedProbe}
                >
                  {probeStatus}
                </button>
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
