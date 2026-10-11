/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { client } from "@/lib/contract";
import { writeIc } from "@/lib/write";
import { formatEther } from "viem";
import { ActionModal } from "@/components/ActionModal";
import { CONTRACT_ADDRESS, IS_CONTRACT_ADDRESS_VALID } from "@/lib/env";

type Tab = 'open' | 'settled' | 'credits';

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
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    if (!address) {
      setLoading(false);
      return;
    }
    if (!IS_CONTRACT_ADDRESS_VALID || !CONTRACT_ADDRESS) {
      setLoadError("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured or invalid.");
      setLoading(false);
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
      
      const addrLower = address.toLowerCase();
      setEscrows(loaded.filter(e => e.funder.toLowerCase() === addrLower || e.recipient.toLowerCase() === addrLower));
      
      const cred = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_credit",
        args: [address]
      });
      setCredit(BigInt(cred as string));
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.message || "Failed to load account locks");
    } finally {
      setLoading(false);
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
      alert('No outstanding pull credit available.');
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

  const handleCopyAddress = () => {
    if (address) navigator.clipboard.writeText(address);
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

  if (!address) {
    return (
      <div className="flex flex-col w-full text-on-surface py-space-2xl px-margin-sm md:px-margin items-center justify-center gap-space-md">
        <span className="material-symbols-outlined text-4xl text-primary-fixed">account_balance_wallet</span>
        <h2 className="font-headline-md text-headline-md uppercase text-primary">Wallet Not Connected</h2>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md text-center">
          Connect your GenLayer wallet to view active escrows, claimable refunds, and pull credits associated with your address.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full text-on-surface">
      {loadError && (
        <div className="w-full bg-error-container text-on-error-container px-margin-sm md:px-margin py-space-sm font-mono-data-sm text-[12px] flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>CONTRACT ERROR: {loadError}</span>
          </div>
        </div>
      )}

      {/* INDUSTRIAL OPERATIONAL HERO RIBBON */}
      <section className="w-full bg-surface border-b border-outline/10 py-space-xl">
        <div className="w-full px-margin-sm md:px-margin flex flex-col gap-space-lg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">
                <span className="text-primary-fixed">[ACCOUNT DOCK]</span>
                <span>{"//"}</span>
                <span>PARTICIPANT LEDGER</span>
                <span>{"//"}</span>
                <span className="text-secondary truncate max-w-[150px] font-mono" title={CONTRACT_ADDRESS}>
                  {CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}` : "NOT WIRED"}
                </span>
              </div>
              <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-primary tracking-tight font-normal">
                Personal Escrow Portal
              </h1>
              <div className="flex items-center gap-space-sm mt-1">
                <span className="font-mono-data-sm text-mono-data-sm text-on-surface font-semibold select-all break-all">{address}</span>
                <button onClick={handleCopyAddress} className="hover:text-primary-fixed text-on-surface-variant" title="Copy Address">
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                </button>
              </div>
            </div>

            <div className="bg-surface-container p-space-md flex flex-wrap gap-space-lg items-center border border-outline/10">
              <div className="flex flex-col">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">ACTIVE LOCKS</span>
                <span className="font-mono-metric-md text-mono-metric-md text-primary font-bold">{openLocks.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">SETTLED LOCKS</span>
                <span className="font-mono-metric-md text-mono-metric-md text-on-surface font-bold">{settledLocks.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">AVAILABLE PULL CREDIT</span>
                <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed font-bold">{formatEther(credit)} GEN</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-space-xs border-b border-outline/10 pt-space-md font-mono-label-xs text-mono-label-xs">
            <button
              onClick={() => setActiveTab('open')}
              className={`px-space-md py-space-sm uppercase tracking-wider font-semibold border-b-2 transition-colors ${
                activeTab === 'open' 
                  ? 'border-primary-fixed text-primary-fixed bg-surface-container-low' 
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Active Escrows ({openLocks.length})
            </button>
            <button
              onClick={() => setActiveTab('settled')}
              className={`px-space-md py-space-sm uppercase tracking-wider font-semibold border-b-2 transition-colors ${
                activeTab === 'settled' 
                  ? 'border-primary-fixed text-primary-fixed bg-surface-container-low' 
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Settled Escrows ({settledLocks.length})
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={`px-space-md py-space-sm uppercase tracking-wider font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'credits' 
                  ? 'border-primary-fixed text-primary-fixed bg-surface-container-low' 
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span>Fallback Credits</span>
              {credit > 0n && (
                <span className="px-1.5 py-0.2 bg-primary-fixed text-on-primary-fixed text-[10px] font-bold">
                  {formatEther(credit)} GEN
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* MAIN CONTENT AREA */}
      <section className="w-full bg-surface-container-lowest py-space-xl px-margin-sm md:px-margin">
        {activeTab === 'open' && (
          <div className="flex flex-col gap-space-md">
            {openLocks.length === 0 ? (
              <div className="p-space-xl bg-surface-container text-center text-on-surface-variant font-mono-data-sm">
                NO ACTIVE ESCROWS FOUND FOR THIS ACCOUNT
              </div>
            ) : openLocks.map(escrow => (
              <div key={escrow.id} className="bg-surface-container p-space-md md:p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md shadow-sm border border-outline/10">
                <div className="flex flex-col gap-1 min-w-[260px]">
                  <div className="flex items-center gap-space-sm">
                    <span className="px-space-xs py-0.5 bg-surface-container-high text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase font-bold">
                      {escrow.state}
                    </span>
                    {escrow.matchReason && (
                      <span className="px-1.5 py-0.5 bg-secondary-container/20 text-secondary text-[10px] font-mono">
                        {escrow.matchReason}
                      </span>
                    )}
                    <span className="text-on-surface-variant font-mono-data-sm text-[12px]">{escrow.registry}</span>
                  </div>
                  <span className="font-headline-sm text-headline-sm text-primary mt-1">
                    <Link className="hover:text-primary-fixed" href={`/escrow/${escrow.id}`}>{escrow.pkg}</Link> @ {escrow.ver}
                  </span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">{escrow.desc}</span>
                </div>
                
                <div className="flex flex-col md:items-center gap-0.5">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">ROLE</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface font-semibold">
                    {escrow.funder.toLowerCase() === address.toLowerCase() ? 'Funder (Locked Principal)' : 'Beneficiary (Payee)'}
                  </span>
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">
                    Window End: {escrow.window}
                  </span>
                </div>

                <div className="flex flex-col md:items-end gap-space-xs">
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono-metric-md text-mono-metric-md text-primary font-bold">{formatEther(escrow.amount)}</span>
                    <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed">GEN</span>
                  </div>
                  <div className="flex items-center gap-space-xs">
                    <Link 
                      href={`/escrow/${escrow.id}`}
                      className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-bright text-on-surface font-mono-data-sm text-mono-data-sm uppercase transition-colors"
                    >
                      Detail
                    </Link>
                    {renderActionButtons(escrow)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'settled' && (
          <div className="flex flex-col gap-space-md">
            {settledLocks.length === 0 ? (
              <div className="p-space-xl bg-surface-container text-center text-on-surface-variant font-mono-data-sm">
                NO SETTLED ESCROWS FOUND FOR THIS ACCOUNT
              </div>
            ) : settledLocks.map(escrow => (
              <div key={escrow.id} className="bg-surface-container p-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md shadow-sm">
                <div className="flex flex-col gap-1 min-w-[260px]">
                  <div className="flex items-center gap-space-sm">
                    <span className={`px-space-xs py-0.5 font-mono-label-xs text-mono-label-xs uppercase font-bold ${
                      escrow.state === 'RELEASED' ? 'bg-surface-container-high text-primary-fixed' :
                      escrow.state === 'REFUND_NOHIT' ? 'bg-error-container text-on-error-container' :
                      'bg-surface-container-highest text-on-surface-variant'
                    }`}>{escrow.state}</span>
                  </div>
                  <span className="font-headline-sm text-headline-sm text-primary mt-1">
                    <Link className="hover:text-primary-fixed" href={`/escrow/${escrow.id}`}>{escrow.pkg}</Link> @ {escrow.ver}
                  </span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">ID: {escrow.id}</span>
                </div>
                <div className="flex flex-col md:items-center gap-0.5">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">ROLE</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface">
                    {escrow.funder.toLowerCase() === address.toLowerCase() ? 'Funded by You' : 'Beneficiary'}
                  </span>
                </div>
                <div className="flex flex-col md:items-end gap-0.5">
                  <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">PRINCIPAL</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono-metric-md text-mono-metric-md text-primary">{formatEther(escrow.amount)}</span>
                    <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">TEST GEN</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'credits' && (
          <div className="flex flex-col gap-space-md">
            <div className="bg-surface-container-high p-space-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
              <div className="flex flex-col gap-1 max-w-2xl">
                <div className="flex items-center gap-space-xs text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase">
                  <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                  <span>DETERMINISTIC PULL CREDITS</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm text-primary">Isolated Pull-Credit Balance</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Under GenLayer smart contracts, if an automated <code className="text-on-surface">emit_transfer</code> execution is constrained (e.g. gas limit mismatch or recipient contract fallback refusal), the escrow principal is automatically credited to the internal contract pull-balance to guarantee funds are never trapped.
                </p>
              </div>
              <div className="bg-surface-container-lowest p-space-md flex flex-col gap-1 min-w-[220px]">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">AVAILABLE FOR PULL</span>
                <span className="font-mono-metric-lg text-mono-metric-lg text-primary-fixed">
                  {formatEther(credit)} GEN
                </span>
                {credit > 0n && (
                  <button
                    onClick={executeWithdraw}
                    disabled={isWithdrawing}
                    className="mt-2 py-2 px-4 bg-primary-container hover:bg-primary text-on-primary-container font-mono-data-sm text-mono-data-sm font-bold uppercase disabled:opacity-50"
                  >
                    {isWithdrawing ? "WITHDRAWING..." : "Withdraw Credit"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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
