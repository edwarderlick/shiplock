"use client";

import React, { useState, useEffect } from "react";
import { client } from "@/lib/contract";
import { CONTRACT_ADDRESS, IS_CONTRACT_ADDRESS_VALID } from "@/lib/env";
import { formatEther } from "viem";

export default function Economics() {
  const [blockTime, setBlockTime] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copyStatus, setCopyStatus] = useState("READY");
  const [liveEconomics, setLiveEconomics] = useState<{
    escrowed_open: bigint;
    paid_to_recipients: bigint;
    refunded_to_funders: bigint;
    outstanding_credits: bigint;
    treasury: bigint;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLiveEconomics = async () => {
    if (!IS_CONTRACT_ADDRESS_VALID || !CONTRACT_ADDRESS) {
      setErrorMsg("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured or invalid.");
      return;
    }
    setErrorMsg(null);
    setIsSyncing(true);
    try {
      const data = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_economics",
        args: [],
      }) as any;
      setLiveEconomics({
        escrowed_open: BigInt(data.escrowed_open ?? 0),
        paid_to_recipients: BigInt(data.paid_to_recipients ?? 0),
        refunded_to_funders: BigInt(data.refunded_to_funders ?? 0),
        outstanding_credits: BigInt(data.outstanding_credits ?? 0),
        treasury: BigInt(data.treasury ?? 0),
      });
      setBlockTime(Math.floor(Date.now() / 1000));
    } catch (e: any) {
      console.error("Failed to query get_economics", e);
      setErrorMsg(e?.message || "Failed to query get_economics");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    setBlockTime(Math.floor(Date.now() / 1000));
    fetchLiveEconomics();
  }, []);

  const contractDisplay = CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}` : "NOT WIRED";

  const jsonContent = `{
  "jsonrpc": "2.0",
  "id": 6199701,
  "result": {
    "contract_address": "${CONTRACT_ADDRESS || "0x..."}",
    "network": {
      "chain_id": 61997,
      "name": "GenLayer Studio Next",
      "consensus": "GenLayer Leaderless Registry Oracles"
    },
    "economics_ledger": {
      "escrowed_open_principal": {
        "wei": "${liveEconomics ? liveEconomics.escrowed_open.toString() : "0"}",
        "formatted_gen": "${liveEconomics ? formatEther(liveEconomics.escrowed_open) : "0.00"} TEST GEN"
      },
      "total_settled_recipients": {
        "wei": "${liveEconomics ? liveEconomics.paid_to_recipients.toString() : "0"}",
        "formatted_gen": "${liveEconomics ? formatEther(liveEconomics.paid_to_recipients) : "0.00"} TEST GEN"
      },
      "total_refunded_funders": {
        "wei": "${liveEconomics ? liveEconomics.refunded_to_funders.toString() : "0"}",
        "formatted_gen": "${liveEconomics ? formatEther(liveEconomics.refunded_to_funders) : "0.00"} TEST GEN",
        "settlement_states": ["REFUND_NOHIT", "CANCELED", "EXPIRED"]
      },
      "outstanding_fallback_credits": {
        "wei": "${liveEconomics ? liveEconomics.outstanding_credits.toString() : "0"}",
        "formatted_gen": "${liveEconomics ? formatEther(liveEconomics.outstanding_credits) : "0.00"} TEST GEN"
      },
      "protocol_treasury_fee_take": {
        "wei": "${liveEconomics ? liveEconomics.treasury.toString() : "0"}",
        "fee_bps": 0,
        "passthrough_rate": 1.0
      }
    },
    "invariant_conservation": {
      "exact_conservation": true,
      "delta_drift_wei": "0"
    }
  }
}`;

  const handleRefresh = () => {
    fetchLiveEconomics();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonContent).then(() => {
      setCopyStatus("COPIED TO CLIPBOARD");
      setTimeout(() => setCopyStatus("READY"), 2000);
    }).catch(() => {
      setCopyStatus("FAILED TO COPY");
    });
  };

  return (
    <div className="flex flex-col w-full text-on-surface">
      {errorMsg && (
        <div className="w-full bg-error-container text-on-error-container px-margin-sm md:px-margin py-space-sm font-mono-data-sm text-[12px] flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>CONTRACT ERROR: {errorMsg}</span>
          </div>
        </div>
      )}

      {/* Top Telemetry Ribbon */}
      <div className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-xs flex flex-wrap items-center justify-between gap-space-sm text-on-surface-variant font-mono-label-xs text-mono-label-xs tracking-wider">
        <div className="flex items-center gap-space-md flex-wrap">
          <span className="flex items-center gap-1.5 text-primary-fixed font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-fixed animate-pulse"></span>
            GENLAYER STUDIO NEXT (61997)
          </span>
          <span className="text-outline">{"//"}</span>
          <span>RPC: studio-dev.genlayer.com/api</span>
          <span className="text-outline">{"//"}</span>
          <span>METHOD: <span className="text-on-surface">ShipLock.get_economics()</span></span>
        </div>
        <div className="flex items-center gap-space-md">
          <span className="text-on-surface font-mono-data-sm text-mono-data-sm">
            QUERY_TIMESTAMP: <span className="text-primary-fixed">{blockTime || "SYNCING"}</span>
          </span>
          <button 
            className={`px-space-xs py-0.5 font-mono-label-xs uppercase transition-colors flex items-center gap-1 ${
              isSyncing ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high hover:bg-surface-bright text-on-surface'
            }`}
            onClick={handleRefresh}
            disabled={isSyncing}
          >
            <span className="material-symbols-outlined text-[12px]">{isSyncing ? 'sync' : 'refresh'}</span>
            {isSyncing ? 'QUERYING...' : 'REFRESH LIVE DATA'}
          </button>
        </div>
      </div>

      {/* Editorial Headline Section */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface flex flex-col gap-space-lg relative overflow-hidden">
        <div className="flex flex-col gap-space-xs max-w-5xl z-10">
          <div className="flex items-center gap-space-sm font-mono-label-xs text-mono-label-xs tracking-widest text-primary-fixed uppercase">
            <span>[LEDGER::CONSERVATION_INVARIANT]</span>
            <span className="text-outline">/</span>
            <span>PROTOCOL ECONOMICS REPORT</span>
            <span className="text-outline">/</span>
            <span className="bg-primary-container text-on-primary-container px-1.5 py-0.2 font-semibold">100% DETERMINISTIC</span>
          </div>
          <h1 className="font-display-lg text-display-lg text-primary tracking-tight font-normal">
            Deterministic Escrow Economics
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl leading-relaxed mt-space-xs">
            Zero treasury haircut. Zero validator rent-seeking. Zero party-supplied payout splits. 
            <span className="text-on-surface font-medium"> 100% principal routing</span> to recipient on verified release, or 
            <span className="text-on-surface font-medium"> 100% refund</span> to funder on unverified, canceled, or expired locks.
          </p>
        </div>

        {/* Architectural Badge Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm pt-space-xs z-10">
          <div className="bg-surface-container-low p-space-md flex flex-col gap-1">
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Settlement Architecture</span>
            <span className="font-headline-sm text-headline-sm text-primary">Non-Custodial Escrow</span>
            <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">Contract: <span className="text-secondary font-mono">{contractDisplay}</span></span>
          </div>
          <div className="bg-surface-container-low p-space-md flex flex-col gap-1">
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Protocol Fee Rate</span>
            <span className="font-headline-sm text-headline-sm text-primary">0.00 BPS (0%)</span>
            <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">Treasury Take: <span className="text-primary-fixed font-semibold">0.00 GEN</span></span>
          </div>
          <div className="bg-surface-container-low p-space-md flex flex-col gap-1">
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Network Execution</span>
            <span className="font-headline-sm text-headline-sm text-primary">GenLayer Studio Next</span>
            <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">Chain ID: <span className="text-primary-fixed font-semibold">61997</span></span>
          </div>
        </div>
      </section>

      {/* Live Financial Ledger Cards */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface-container-lowest">
        <div className="flex flex-col gap-space-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="w-2.5 h-2.5 bg-primary-fixed"></span>
              <h2 className="font-headline-md text-headline-md uppercase text-primary tracking-tight">Live Contract Economics</h2>
            </div>
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">SOURCE: ON-CHAIN GET_ECONOMICS</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
            {/* Metric 1 */}
            <div className="bg-surface-container p-space-lg flex flex-col justify-between shadow-sm border border-outline/10">
              <div className="flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">ESCROWED OPEN PRINCIPAL</span>
                <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary mt-1">
                  {liveEconomics ? formatEther(liveEconomics.escrowed_open) : "..."}
                </span>
                <span className="text-primary-fixed font-mono-label-xs text-mono-label-xs">TEST GEN</span>
              </div>
              <span className="font-mono-data-sm text-[11px] text-on-surface-variant mt-3">
                Locked in active open escrows awaiting delivery or window maturity.
              </span>
            </div>

            {/* Metric 2 */}
            <div className="bg-surface-container p-space-lg flex flex-col justify-between shadow-sm border border-outline/10">
              <div className="flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">PAID TO RECIPIENTS</span>
                <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed mt-1">
                  {liveEconomics ? formatEther(liveEconomics.paid_to_recipients) : "..."}
                </span>
                <span className="text-primary-fixed font-mono-label-xs text-mono-label-xs">TEST GEN</span>
              </div>
              <span className="font-mono-data-sm text-[11px] text-on-surface-variant mt-3">
                100% disbursed to package maintainers upon confirmed in-window release.
              </span>
            </div>

            {/* Metric 3 */}
            <div className="bg-surface-container p-space-lg flex flex-col justify-between shadow-sm border border-outline/10">
              <div className="flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">REFUNDED TO FUNDERS</span>
                <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-error mt-1">
                  {liveEconomics ? formatEther(liveEconomics.refunded_to_funders) : "..."}
                </span>
                <span className="text-error font-mono-label-xs text-mono-label-xs">TEST GEN</span>
              </div>
              <span className="font-mono-data-sm text-[11px] text-on-surface-variant mt-3">
                Returned to funders on REFUND_NOHIT, CANCELED, or EXPIRED locks.
              </span>
            </div>

            {/* Metric 4 */}
            <div className="bg-surface-container p-space-lg flex flex-col justify-between shadow-sm border border-outline/10">
              <div className="flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">OUTSTANDING PULL CREDITS</span>
                <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-secondary mt-1">
                  {liveEconomics ? formatEther(liveEconomics.outstanding_credits) : "..."}
                </span>
                <span className="text-secondary font-mono-label-xs text-mono-label-xs">TEST GEN</span>
              </div>
              <span className="font-mono-data-sm text-[11px] text-on-surface-variant mt-3">
                Available in contract pull balances for immediate withdrawal claim.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* JSON Schema Code View */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface">
        <div className="flex flex-col gap-space-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed uppercase font-bold">API SCHEMA</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">{"// ILLUSTRATIVE GET_ECONOMICS PAYLOAD"}</span>
            </div>
            <button 
              onClick={handleCopy}
              className="px-space-md py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface font-mono-label-xs text-mono-label-xs uppercase transition-colors"
            >
              {copyStatus}
            </button>
          </div>

          <div className="bg-surface-container-lowest p-space-md border border-outline/10 font-mono text-mono-data-sm text-on-surface relative">
            <pre className="overflow-x-auto text-on-surface-variant leading-relaxed select-all">
              <code>{jsonContent}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
