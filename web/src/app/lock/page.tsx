"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet";
import { formatAddress } from "@/lib/format";
import { writeIc } from "@/lib/write";
import { parseEther, getAddress } from "viem";
import { CONTRACT_ADDRESS } from "@/lib/env";
import { useRouter } from "next/navigation";

export default function LockPage() {
  const { address, selectedProvider } = useWallet();
  const [template, setTemplate] = useState<"PYPI" | "NPM">("PYPI");
  const [pkg, setPkg] = useState("");
  const [ver, setVer] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  
  const [startUtc, setStartUtc] = useState("");
  const [endUtc, setEndUtc] = useState("");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  
  const [txProgress, setTxProgress] = useState<string>("REVIEW");
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txExec, setTxExec] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
    setStartUtc(start.toISOString().split('.')[0] + 'Z');
    setEndUtc(end.toISOString().split('.')[0] + 'Z');
  }, []);

  const broadcastTransaction = async () => {
    if (!address) {
      alert("Please connect wallet first");
      return;
    }
    if (!recipient || !recipient.trim()) {
      alert("recipient missing");
      return;
    }
    let normalizedRecipient;
    try {
      normalizedRecipient = getAddress(recipient.trim());
    } catch (err) {
      alert("invalid recipient address");
      return;
    }

    setTxProgress("ESTIMATING FEES");
    setTxError(null);
    setTxHash(null);
    setTxStatus(null);
    setTxExec(null);

    let finalTxHash = null;

    try {
      const { txId, returnedId, status, exec } = await writeIc({
        account: address,
        provider: selectedProvider,
        functionName: "fund_escrow",
        args: [
          `${template}_VERSION`,
          pkg,
          ver,
          normalizedRecipient,
          startUtc,
          endUtc
        ],
        value: parseEther(amount || "0"),
        onProgress: (stage, extra) => {
          setTxProgress(stage);
          if (extra?.hash) setTxHash(extra.hash);
          if (extra?.status) setTxStatus(extra.status);
          if (extra?.exec) setTxExec(extra.exec);
        }
      });
      
      finalTxHash = txId;
      const id = typeof returnedId === "string" && returnedId.startsWith("0x") ? returnedId : null;
      setTxProgress("SUCCESS");
      
      setShowToast(true);
      if (id) {
        router.push('/escrow/' + id);
      } else {
        router.push('/browse');
      }
    } catch (error: any) {
      console.error(error);
      const msg = error?.details || error?.shortMessage || error?.message || String(error);
      setTxError(msg);
      setTxProgress("FAILED");
    }
  };

  return (
    <div className="flex flex-col w-full relative">
      {/* INDUSTRIAL OPERATIONAL STATUS BAR */}
      <section className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-sm">
        <div className="w-full flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-sm font-mono-data-sm text-mono-data-sm">
          <div className="flex flex-wrap items-center gap-space-md">
            <div className="flex items-center gap-space-xs text-primary-fixed font-semibold tracking-wider uppercase">
              <span className="inline-block w-2 h-2 rounded-full bg-primary-fixed animate-pulse"></span>
              <span>SYSTEM ACTIVE</span>
            </div>
            <span className="text-outline hidden sm:inline">|</span>
            <div className="text-on-surface-variant flex items-center gap-1.5">
              <span className="text-outline">ENV:</span>
              <span className="text-on-surface">GenLayer Studio Next</span>
              <span className="px-1.5 py-0.5 bg-surface-container text-[10px] font-mono-label-xs text-primary-fixed">CHAIN ID 61997</span>
            </div>
            <span className="text-outline hidden sm:inline">|</span>
            <div className="text-on-surface-variant flex items-center gap-1.5">
              <span className="text-outline">RPC:</span>
              <span className="text-on-surface font-mono-data-sm">studio-dev.genlayer.com</span>
            </div>
          </div>
          <div className="flex items-center gap-space-md w-full lg:w-auto justify-between lg:justify-end">
            <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs text-on-surface-variant">
              <span className="text-primary-fixed">[GAS: 0.00018 GEN]</span>
              <span className="text-outline">//</span>
              <span>QUORUM: 5/5 ONLINE</span>
            </div>
            <div className="px-2 py-0.5 bg-surface-container-high text-primary-fixed text-mono-label-xs font-mono-label-xs uppercase">
              DISINTERMEDIATED ESCROW
            </div>
          </div>
        </div>
      </section>

      {/* HERO EDITORIAL & STEP CONTROLLER HEADER */}
      <section className="w-full bg-surface px-margin-sm md:px-margin py-space-xl">
        <div className="w-full flex flex-col gap-space-lg">
          <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-space-md">
            <div className="flex flex-col max-w-3xl gap-space-xs">
              <div className="flex items-center gap-space-sm font-mono-label-xs text-mono-label-xs tracking-widest text-primary-fixed uppercase">
                <span>[PROTOCOL // CAD_REGISTRY_LOCK]</span>
                <span className="text-outline">/</span>
                <span>SPEC v2.4.9</span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
                Programmatic lock escrow choreographed to package release.
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
                Autonomous settlement conditioned on tamper-proof PyPI and npm indexer publications. Funds lock deterministically in GenLayer intelligent contracts until the target semantic version releases.
              </p>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-1 font-mono-data-sm text-mono-data-sm">
              <span className="text-on-surface-variant">FUNDING WALLET</span>
              <span className="text-primary-fixed bg-surface-container-low px-space-md py-1 font-medium">
                {address ? `${formatAddress(address)} (CONNECTED)` : "NOT CONNECTED"}
              </span>
              <span className="text-outline font-mono-label-xs text-mono-label-xs">BALANCE: 420.50 TEST GEN</span>
            </div>
          </div>

          {/* 6-STEP PIPELINE TRACKER */}
          <div className="w-full bg-surface-container-lowest p-space-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <div className="flex flex-col p-space-sm bg-surface-container-low transition-colors group cursor-pointer">
                <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs mb-1">
                  <span className="text-primary-fixed font-bold">01</span>
                  <span className="material-symbols-outlined text-primary-fixed text-[14px]">check_circle</span>
                </div>
                <span className="font-headline-sm text-[13px] uppercase tracking-tight text-primary">Template</span>
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed truncate mt-0.5">{template}_VERSION</span>
              </div>
              <div className="flex flex-col p-space-sm bg-surface-container-low transition-colors group cursor-pointer">
                <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs mb-1">
                  <span className="text-primary-fixed font-bold">02</span>
                  <span className="material-symbols-outlined text-primary-fixed text-[14px]">check_circle</span>
                </div>
                <span className="font-headline-sm text-[13px] uppercase tracking-tight text-primary">Package</span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant truncate mt-0.5">{pkg}:{ver}</span>
              </div>
              <div className="flex flex-col p-space-sm bg-surface-container-low transition-colors group cursor-pointer">
                <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs mb-1">
                  <span className="text-primary-fixed font-bold">03</span>
                  <span className="material-symbols-outlined text-primary-fixed text-[14px]">check_circle</span>
                </div>
                <span className="font-headline-sm text-[13px] uppercase tracking-tight text-primary">Recipient</span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant truncate mt-0.5">{recipient ? `${recipient.slice(0, 6)}...${recipient.slice(-4)}` : "0x..."}</span>
              </div>
              <div className="flex flex-col p-space-sm bg-surface-container-low transition-colors group cursor-pointer">
                <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs mb-1">
                  <span className="text-primary-fixed font-bold">04</span>
                  <span className="material-symbols-outlined text-primary-fixed text-[14px]">check_circle</span>
                </div>
                <span className="font-headline-sm text-[13px] uppercase tracking-tight text-primary">Window</span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant truncate mt-0.5">{startUtc ? `${startUtc.slice(5,10)} - ${endUtc.slice(5,10)}` : "Not Set"}</span>
              </div>
              <div className="flex flex-col p-space-sm bg-surface-container-low transition-colors group cursor-pointer">
                <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs mb-1">
                  <span className="text-primary-fixed font-bold">05</span>
                  <span className="material-symbols-outlined text-primary-fixed text-[14px]">check_circle</span>
                </div>
                <span className="font-headline-sm text-[13px] uppercase tracking-tight text-primary">Amount</span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant truncate mt-0.5">{amount || "0.00"} GEN</span>
              </div>
              <div className="flex flex-col p-space-sm bg-primary-container text-on-primary-container shadow-md">
                <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs mb-1">
                  <span className="font-black text-on-primary-container">06</span>
                  <span className="px-1 bg-surface-dim text-primary-fixed text-[9px] font-bold uppercase">FINAL</span>
                </div>
                <span className="font-headline-sm text-[13px] uppercase tracking-tight font-bold text-on-primary-container">Review & Lock</span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-primary font-semibold truncate mt-0.5">READY FOR TX</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DUAL-CHAMBER INDUSTRIAL WORKSPACE */}
      <section className="w-full bg-surface-dim px-margin-sm md:px-margin pb-space-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
          {/* LEFT PRIMARY WIZARD FORM COLUMN */}
          <div className="lg:col-span-7 flex flex-col gap-space-lg">
            {/* STEP 01 */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 01</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Template Protocol</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[CAD_ROUTE: ORACLE_REGISTRY]</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Selects the verified immutable upstream index feed. Does not permit party-supplied payout multiples or subjective human arbiters.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <button 
                  onClick={() => setTemplate("PYPI")}
                  className={`flex flex-col items-start p-space-md text-left transition-all relative ${template === 'PYPI' ? 'bg-surface-container' : 'bg-surface-container-lowest hover:bg-surface-container group'}`}
                >
                  <div className="flex items-center justify-between w-full mb-space-xs">
                    <div className={`flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs font-bold tracking-wider ${template === 'PYPI' ? 'text-primary-fixed' : 'text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined text-[16px]">terminal</span>
                      <span>PYPI_VERSION</span>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${template === 'PYPI' ? 'bg-primary-fixed' : 'bg-surface-container-highest'}`}></span>
                  </div>
                  <span className={`font-headline-sm text-headline-sm ${template === 'PYPI' ? 'text-primary' : 'text-secondary'}`}>Python Package Index</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-1">Official JSON API feed via pypi.org/pypi/{'{pkg}/{ver}'}/json</span>
                  <div className={`mt-space-md w-full flex items-center justify-between pt-space-xs px-2 py-1 ${template === 'PYPI' ? 'bg-surface-container-lowest' : 'bg-surface-container'}`}>
                    <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">LEADERLESS QUORUM</span>
                    <span className={`font-mono-label-xs text-mono-label-xs ${template === 'PYPI' ? 'text-primary-fixed' : 'text-secondary'}`}>
                      {template === 'PYPI' ? '5/5 VERIFIERS' : 'STANDBY'}
                    </span>
                  </div>
                </button>
                <button 
                  onClick={() => setTemplate("NPM")}
                  className={`flex flex-col items-start p-space-md text-left transition-all relative ${template === 'NPM' ? 'bg-surface-container' : 'bg-surface-container-lowest hover:bg-surface-container group'}`}
                >
                  <div className="flex items-center justify-between w-full mb-space-xs">
                    <div className={`flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs font-bold tracking-wider ${template === 'NPM' ? 'text-primary-fixed' : 'text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined text-[16px]">code</span>
                      <span>NPM_VERSION</span>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${template === 'NPM' ? 'bg-primary-fixed' : 'bg-surface-container-highest'}`}></span>
                  </div>
                  <span className={`font-headline-sm text-headline-sm ${template === 'NPM' ? 'text-primary' : 'text-secondary'}`}>Node Package Manager</span>
                  <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-1">registry.npmjs.org direct tarball/manifest notarization</span>
                  <div className={`mt-space-md w-full flex items-center justify-between pt-space-xs px-2 py-1 ${template === 'NPM' ? 'bg-surface-container-lowest' : 'bg-surface-container'}`}>
                    <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">LEADERLESS QUORUM</span>
                    <span className={`font-mono-label-xs text-mono-label-xs ${template === 'NPM' ? 'text-primary-fixed' : 'text-secondary'}`}>
                      {template === 'NPM' ? '5/5 VERIFIERS' : 'STANDBY'}
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* STEP 02 */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 02</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Artifact Coordinates</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  <span>SYNTAX STRICT</span>
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md">
                <div className="md:col-span-7 flex flex-col gap-1">
                  <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider flex justify-between">
                    <span>TARGET PACKAGE IDENTIFIER</span>
                    <span className="text-primary-fixed font-medium">CANONICAL {template} SLUG</span>
                  </label>
                  <div className="relative flex items-center bg-surface-container-lowest">
                    <span className="material-symbols-outlined text-outline text-[18px] ml-space-md">inventory_2</span>
                    <input 
                      value={pkg}
                      onChange={(e) => setPkg(e.target.value)}
                      className="w-full bg-transparent px-space-md py-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:text-primary-fixed" 
                      placeholder="e.g. fastapi-auth-guards" 
                      type="text" 
                    />
                    <span className="material-symbols-outlined text-primary-fixed text-[18px] mr-space-md">check_circle</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono-label-xs text-mono-label-xs text-primary-fixed mt-0.5">
                    <span className="material-symbols-outlined text-[12px]">done</span>
                    <span>Valid registry syntax. Lowercase ASCII and hyphens only.</span>
                  </div>
                </div>
                <div className="md:col-span-5 flex flex-col gap-1">
                  <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider flex justify-between">
                    <span>SEMANTIC VERSION</span>
                    <span className="text-outline">SEMVER STRICT</span>
                  </label>
                  <div className="relative flex items-center bg-surface-container-lowest">
                    <span className="material-symbols-outlined text-outline text-[18px] ml-space-md">tag</span>
                    <input 
                      value={ver}
                      onChange={(e) => setVer(e.target.value)}
                      className="w-full bg-transparent px-space-md py-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:text-primary-fixed" 
                      placeholder="e.g. 0.4.2" 
                      type="text" 
                    />
                    <span className="material-symbols-outlined text-primary-fixed text-[18px] mr-space-md">check_circle</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono-label-xs text-mono-label-xs text-on-surface-variant mt-0.5">
                    <span className="text-error font-bold tracking-wider">!</span>
                    <span>Exact semver required. "latest" or "v" prefix rejected.</span>
                  </div>
                </div>
              </div>

              {/* LIVE CONSTRUCTED ORACLE FEED PREVIEW */}
              <div className="bg-surface-container p-space-md flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="px-1.5 py-0.5 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs font-bold uppercase">
                      OFFICIAL REGISTRY FEED
                    </span>
                    <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">AUTONOMOUS ORACLE RESOLVER</span>
                  </div>
                  <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed">HTTP 404 (FUTURE PUBLICATION)</span>
                </div>
                <div className="bg-surface-container-lowest p-space-sm font-mono-data-sm text-mono-data-sm text-primary-fixed break-all select-all flex items-center justify-between gap-space-sm">
                  <span>
                    {template === 'PYPI' 
                      ? `https://pypi.org/pypi/${pkg || 'pkg'}/${ver || '0.0.1'}/json`
                      : `https://registry.npmjs.org/${pkg || 'pkg'}/${ver || '0.0.1'}`
                    }
                  </span>
                  <button 
                    onClick={() => {
                      const url = template === 'PYPI' ? `https://pypi.org/pypi/${pkg}/${ver}/json` : `https://registry.npmjs.org/${pkg}/${ver}`;
                      navigator.clipboard.writeText(url);
                    }}
                    className="px-2 py-1 bg-surface-container text-on-surface hover:text-primary-fixed text-[11px] uppercase font-mono-label-xs flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[13px]">content_copy</span>
                    <span>COPY</span>
                  </button>
                </div>
                <p className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">
                  GenLayer consensus nodes will execute leaderless HTTP GET queries against this endpoint throughout the active verification epoch.
                </p>
              </div>
            </div>

            {/* STEP 03 */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 03</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Beneficiary Vault</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[PAYEE ASSIGNMENT]</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider flex justify-between">
                  <span>RECIPIENT EVM WALLET ADDRESS</span>
                  <span className="text-primary-fixed font-medium">UNIQUE ACTOR CHECK PASSED</span>
                </label>
                <div className="relative flex items-center bg-surface-container-lowest">
                  <span className="material-symbols-outlined text-outline text-[18px] ml-space-md">account_balance_wallet</span>
                  <input 
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="w-full bg-transparent px-space-md py-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:text-primary-fixed" 
                    type="text" 
                    placeholder="0x..."
                  />
                  <span className="material-symbols-outlined text-primary-fixed text-[18px] mr-space-md">format_image_left</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-mono-data-sm font-mono-data-sm mt-1 bg-surface-container px-space-sm py-1">
                  <span className="text-on-surface-variant">Validator Rule: <span className="text-on-surface">Recipient != Funder ({address ? formatAddress(address) : "0x..."})</span></span>
                  <span className={`font-semibold tracking-wider ${recipient && recipient.toLowerCase() === address?.toLowerCase() ? "text-error" : "text-primary-fixed"}`}>
                    {recipient && recipient.toLowerCase() === address?.toLowerCase() ? "MUST NOT EQUAL CONNECTED WALLET" : "VERIFIED UNIQUE BENEFICIARY"}
                  </span>
                </div>
              </div>
            </div>

            {/* STEP 04 */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 04</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Temporal Execution Window</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed">[DELTA: EXACTLY 7 DAYS]</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">WINDOW START (UTC)</span>
                  <div className="bg-surface-container-lowest p-space-xs flex items-center justify-between">
                    <input
                      type="text"
                      value={startUtc}
                      onChange={(e) => setStartUtc(e.target.value)}
                      className="w-full bg-transparent px-space-sm py-1 text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:text-primary-fixed"
                      placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    />
                    <span className="material-symbols-outlined text-on-surface-variant text-[16px] mr-2">schedule</span>
                  </div>
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant mt-0.5">Evaluation gate unlocks at this timestamp</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">WINDOW CLOSE (UTC)</span>
                  <div className="bg-surface-container-lowest p-space-xs flex items-center justify-between">
                    <input
                      type="text"
                      value={endUtc}
                      onChange={(e) => setEndUtc(e.target.value)}
                      className="w-full bg-transparent px-space-sm py-1 text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:text-primary-fixed"
                      placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    />
                    <span className="material-symbols-outlined text-on-surface-variant text-[16px] mr-2">event_busy</span>
                  </div>
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant mt-0.5">SLA deadline; no releases accepted after</span>
                </div>
              </div>

              {/* UNDERWRITING CAD VERIFICATION BOX */}
              <div className="bg-surface-container p-space-md flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase tracking-wider text-primary-fixed font-bold">
                    SYSTEM UNDERWRITING & SAFETY AUDIT
                  </span>
                  {(() => {
                    const sd = new Date(startUtc);
                    const ed = new Date(endUtc);
                    const isBlocked = isNaN(sd.getTime()) || sd.getTime() < Date.now() + 24 * 60 * 60 * 1000;
                    if (isBlocked) {
                      return <span className="px-1.5 py-0.5 bg-error text-on-error font-mono-label-xs text-mono-label-xs">BLOCKED</span>;
                    }
                    return <span className="px-1.5 py-0.5 bg-surface-container-highest text-primary font-mono-label-xs text-mono-label-xs">4/4 SATISFIED</span>;
                  })()}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm font-mono-data-sm text-mono-data-sm">
                  <div className="flex items-start gap-space-xs text-on-surface-variant bg-surface-container-lowest p-space-xs">
                    <span className="material-symbols-outlined text-primary-fixed text-[16px] mt-0.5">task_alt</span>
                    <div>
                      <div className="text-on-surface font-medium">Fundable Until:</div>
                      <div className="text-primary-fixed">{!isNaN(new Date(startUtc).getTime()) ? new Date(new Date(startUtc).getTime() - 24 * 60 * 60 * 1000).toISOString() : "INVALID"}</div>
                      <div className="text-[10px] text-outline">(&gt;= 24h lead-time gate passed)</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-space-xs text-on-surface-variant bg-surface-container-lowest p-space-xs">
                    <span className="material-symbols-outlined text-primary-fixed text-[16px] mt-0.5">task_alt</span>
                    <div>
                      <div className="text-on-surface font-medium">FUTURE_SHIP Status:</div>
                      <div className="text-primary-fixed">Registry confirms 404</div>
                      <div className="text-[10px] text-outline">Target version does not exist on PyPI</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-space-xs text-on-surface-variant bg-surface-container-lowest p-space-xs">
                    <span className="material-symbols-outlined text-primary-fixed text-[16px] mt-0.5">task_alt</span>
                    <div>
                      <div className="text-on-surface font-medium">Release Evaluation Window:</div>
                      <div className="text-primary-fixed">{startUtc} to {endUtc}</div>
                      <div className="text-[10px] text-outline">Span: {!isNaN(new Date(startUtc).getTime()) && !isNaN(new Date(endUtc).getTime()) ? ((new Date(endUtc).getTime() - new Date(startUtc).getTime()) / (1000 * 60 * 60)).toFixed(1) : 0} hours (Limit: 24h - 336h)</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-space-xs text-on-surface-variant bg-surface-container-lowest p-space-xs">
                    <span className="material-symbols-outlined text-primary-fixed text-[16px] mt-0.5">task_alt</span>
                    <div>
                      <div className="text-on-surface font-medium">Auto-Refund Grace Period:</div>
                      <div className="text-primary-fixed">{!isNaN(new Date(endUtc).getTime()) ? new Date(new Date(endUtc).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : "INVALID"}</div>
                      <div className="text-[10px] text-outline">+7 days past close if un-dispatched</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 05 */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 05</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Escrow Liquidity</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[TOKEN: GEN NATIVE]</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider flex justify-between">
                  <span>PRINCIPAL LOCK AMOUNT</span>
                  <span className="text-on-surface">Available: 420.50 GEN</span>
                </label>
                <div className="relative flex items-center bg-surface-container-lowest">
                  <span className="material-symbols-outlined text-outline text-[18px] ml-space-md">lock</span>
                  <input 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-transparent px-space-md py-space-sm text-primary font-mono-metric-md text-mono-metric-md focus:outline-none focus:text-primary-fixed" 
                    type="number" 
                    step="10.0"
                  />
                  <span className="font-mono-data-sm text-mono-data-sm text-primary-fixed font-bold mr-space-md uppercase">TEST GEN</span>
                </div>
              </div>
              
              <div className="bg-surface-container p-space-md flex items-start gap-space-sm">
                <span className="material-symbols-outlined text-primary-fixed text-[24px] shrink-0">balance</span>
                <div className="flex flex-col gap-1">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase font-bold text-primary-fixed tracking-wider">
                    DETERMINISTIC 100% DISBURSEMENT POLICY
                  </span>
                  <p className="font-body-md text-body-md text-on-surface">
                    <strong>100% payout</strong> to recipient if verified <span className="text-primary-fixed">RELEASED</span> within active window. <strong>100% full refund</strong> directly to funder on <span className="text-error">REFUND_NOHIT</span>, <span className="text-secondary">INSUFFICIENT</span>, <span className="text-secondary">CANCELED</span>, or <span className="text-secondary">EXPIRED</span>. Zero protocol haircut, zero arbiter split, zero custodial hold.
                  </p>
                </div>
              </div>
            </div>

            {/* STEP 06 */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-black">STAGE 06</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Final Verification & Commit</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed font-mono">[CHAIN: 61997]</span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-md pt-space-xs">
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-wider">TOTAL ESCROW COMMITTED</span>
                  <span className="font-mono-metric-lg text-mono-metric-lg text-primary-fixed font-bold tracking-tight">
                    {parseFloat(amount || "0").toFixed(2)} GEN
                  </span>
                  <span className="font-mono-data-sm text-mono-data-sm text-outline">+ Gas est. ~0.00018 GEN</span>
                </div>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  disabled={!CONTRACT_ADDRESS || !address || address.length !== 42 || !recipient || recipient.length !== 42 || recipient.toLowerCase() === address?.toLowerCase()}
                  className="px-space-xl py-space-md bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary font-headline-sm text-headline-sm uppercase tracking-tight flex items-center justify-center gap-space-sm transition-all shadow-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{!CONTRACT_ADDRESS ? "CONTRACT ADDRESS MISSING" : `Confirm & Lock ${parseFloat(amount || "0").toFixed(2)} test GEN`}</span>
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT INDUSTRIAL TELEMETRY SUMMARY DOCK */}
          <div className="lg:col-span-5 flex flex-col gap-space-lg sticky top-20">
            <div className="bg-primary-container text-on-primary-container p-space-lg flex flex-col justify-between min-h-[300px] shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs uppercase tracking-widest font-black">
                  <span className="material-symbols-outlined text-[16px]">lock_clock</span>
                  <span>ESCROW TELEMETRY ANCHOR</span>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs font-mono bg-surface-dim text-primary-fixed px-1.5 py-0.5">READY</span>
              </div>
              <div className="flex flex-col my-space-md">
                <span className="font-mono-label-xs text-mono-label-xs uppercase tracking-widest text-on-primary font-bold">LOCK IDENTIFIER PRE-IMAGE</span>
                <div className="font-display-lg text-display-lg font-normal tracking-tighter leading-none text-on-primary-container mt-1">
                  #0x4B28
                </div>
                <span className="font-mono-data-sm text-mono-data-sm text-on-primary mt-2">Deterministic contract salt computed from release coordinates.</span>
              </div>
              <div className="grid grid-cols-2 gap-space-sm pt-space-md bg-on-primary-container/10 p-space-sm">
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary">SETTLEMENT SLA</span>
                  <span className="font-mono-metric-md text-mono-metric-md font-bold text-on-primary-container">Sub-second</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary">VERIFICATION</span>
                  <span className="font-mono-metric-md text-mono-metric-md font-bold text-on-primary-container">Automated</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between pb-space-xs bg-surface-container-lowest px-space-sm py-1">
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-wider font-bold">
                  CAD SPECIFICATION INSPECTOR
                </span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[SPEC_HASH: 0x90A...11F4]</span>
              </div>
              
              <div className="bg-surface-container-lowest p-space-md flex flex-col items-center justify-center">
                <svg className="w-full h-32 text-primary-fixed" fill="none" viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
                  <line stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" x1="0" x2="400" y1="20" y2="20"></line>
                  <line stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" x1="0" x2="400" y1="60" y2="60"></line>
                  <line stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" x1="0" x2="400" y1="100" y2="100"></line>
                  <line stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" x1="80" x2="80" y1="0" y2="120"></line>
                  <line stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" x1="200" x2="200" y1="0" y2="120"></line>
                  <line stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" x1="320" x2="320" y1="0" y2="120"></line>
                  <rect fill="#201f1f" height="50" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" width="80" x="20" y="35"></rect>
                  <text fill="#ffffff" fontFamily="Space Grotesk" fontSize="10" textAnchor="middle" x="60" y="58">FUNDER</text>
                  <text fill="#d8ee48" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle" x="60" y="72">{parseFloat(amount || "0").toFixed(0)} GEN</text>
                  <path d="M 100 60 L 150 60" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1.5"></path>
                  <polygon fill="currentColor" points="150,60 144,57 144,63"></polygon>
                  <rect fill="#2a2a2a" height="70" stroke="#d8ee48" strokeWidth="1.5" width="100" x="150" y="25"></rect>
                  <text fill="#d8ee48" fontFamily="Space Grotesk" fontSize="11" fontWeight="bold" textAnchor="middle" x="200" y="50">GENLAYER</text>
                  <text fill="#ffffff" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle" x="200" y="65">CAD Escrow</text>
                  <text fill="#c7c8af" fontFamily="JetBrains Mono" fontSize="8" textAnchor="middle" x="200" y="80">7D UTC Window</text>
                  <path d="M 250 60 L 300 60" stroke="currentColor" strokeWidth="1.5"></path>
                  <polygon fill="currentColor" points="300,60 294,57 294,63"></polygon>
                  <rect fill="#201f1f" height="50" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" width="80" x="300" y="35"></rect>
                  <text fill="#ffffff" fontFamily="Space Grotesk" fontSize="10" textAnchor="middle" x="340" y="58">RECIPIENT</text>
                  <text fill="#d8ee48" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle" x="340" y="72">{recipient ? `${recipient.slice(0, 6)}...${recipient.slice(-3)}` : "0x..."}</text>
                </svg>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant mt-1">SCHEMATIC: TIME-GATED NON-CUSTODIAL SETTLEMENT ROUTE</span>
              </div>

              <div className="flex flex-col gap-1 font-mono-data-sm text-mono-data-sm">
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Oracle Registry Host</span>
                  <span className="text-on-surface font-semibold">{template === 'PYPI' ? 'pypi.org' : 'registry.npmjs.org'}</span>
                </div>
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Package Name</span>
                  <span className="text-primary-fixed font-semibold">{pkg || "pkg"}</span>
                </div>
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Exact Semver</span>
                  <span className="text-primary-fixed font-semibold">{ver || "0.0.1"}</span>
                </div>
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Evaluation Window</span>
                  <span className="text-on-surface">168 Hours (7.0 Days)</span>
                </div>
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Minimum Oracle Quorum</span>
                  <span className="text-on-surface font-semibold">100% Consensus (5/5)</span>
                </div>
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Escrow State Initialization</span>
                  <span className="px-2 py-0.5 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs font-bold uppercase">OPEN</span>
                </div>
              </div>

              <div className="bg-surface-container-lowest p-space-md flex flex-col gap-1 text-[11px] font-mono-data-sm text-outline">
                <div className="flex justify-between text-on-surface-variant">
                  <span>[AUDIT_SEQ: 009284]</span>
                  <span className="text-primary-fixed">OK</span>
                </div>
                <p className="text-on-surface-variant">
                  &gt; Handshake verified with GenLayer Studio Next node.<br/>
                  &gt; Cryptographic pre-image salt generated.<br/>
                  &gt; Ready for smart contract allocation on chain 61997.
                </p>
              </div>
            </div>

            <div className="bg-surface-container-lowest p-space-md flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-primary-fixed text-[20px]">verified_user</span>
              <div className="flex flex-col">
                <span className="font-headline-sm text-[12px] uppercase text-primary">Self-Executing Solidity Architecture</span>
                <span className="font-mono-data-sm text-[11px] text-on-surface-variant">Zero custody escrow contract audited for GenLayer protocol.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONFIRMATION & LOCK MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-space-sm">
          <div className="bg-surface-container-low max-w-2xl w-full p-space-lg flex flex-col gap-space-lg shadow-2xl relative">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-wider font-bold">CONFIRMATION PROTOCOL</span>
                <h3 className="font-headline-lg text-headline-lg text-primary tracking-tight">Review & Lock Smart Escrow</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 bg-surface-container flex items-center justify-center text-on-surface hover:text-primary-fixed"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="bg-surface-container p-space-md flex flex-col gap-space-xs font-mono-data-sm text-mono-data-sm">
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>REGISTRY</span>
                <span className="text-on-surface font-semibold">{template === 'PYPI' ? 'PyPI (Python Package Index)' : 'NPM (Node Package Manager)'}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>TARGET ARTIFACT</span>
                <span className="text-primary-fixed font-semibold">{pkg} @ {ver}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>BENEFICIARY ADDRESS</span>
                <span className="text-on-surface font-mono">{recipient || "0x..."}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>RELEASE EPOCH</span>
                <span className="text-on-surface">{startUtc} - {endUtc}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pt-2 bg-surface-container-lowest p-space-xs">
                <span className="text-primary-fixed font-bold">PRINCIPAL ESCROW AMOUNT</span>
                <span className="text-primary-fixed font-bold text-mono-metric-md">{parseFloat(amount || "0").toFixed(2)} TEST GEN</span>
              </div>
            </div>
            <div className="p-space-sm bg-surface-container-lowest text-on-surface-variant font-mono-data-sm text-[11px] flex flex-col gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary-fixed text-[18px]">info</span>
                <span>Action will sign transaction <code>fund_escrow(string,string,string,address,string,string) + value</code> on GenLayer Studio Next (61997).</span>
              </div>
              {txProgress !== 'REVIEW' && (
                <div className="flex flex-col gap-1 mt-2 p-2 bg-surface-dim border border-primary-fixed/20">
                  <div className="flex items-center justify-between">
                    <span className="text-primary-fixed font-bold">STATUS: {txProgress}</span>
                  </div>
                  {txHash && (
                    <div className="text-on-surface">
                      TX Hash: <a href={`https://explorer-studio-dev.genlayer.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-primary hover:underline font-mono break-all">{txHash}</a>
                    </div>
                  )}
                  {txProgress === "SUCCESS" && (
                    <div className="text-on-surface mt-1">
                      OPEN escrow created. Go to escrow...
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
            <div className="flex items-center justify-end gap-space-md">
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setTxProgress("REVIEW");
                  setTxError(null);
                  setTxHash(null);
                  setTxStatus(null);
                  setTxExec(null);
                }}
                className="px-space-md py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface font-headline-sm text-body-md uppercase"
              >
                Abort
              </button>
              <button 
                onClick={broadcastTransaction}
                disabled={txProgress !== 'REVIEW' && txProgress !== 'FAILED'}
                className="px-space-xl py-space-md bg-primary-container text-on-primary-container hover:bg-primary font-headline-sm text-headline-sm uppercase font-bold flex items-center gap-space-xs shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Execute & Broadcast TX</span>
                <span className="material-symbols-outlined text-[18px]">bolt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS HUD NOTIFICATION BANNER */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-primary-container text-on-primary-container p-space-md max-w-md shadow-2xl flex items-start gap-space-sm">
          <span className="material-symbols-outlined text-primary-container bg-surface-dim p-1 text-[20px] shrink-0">check_circle</span>
          <div className="flex flex-col gap-1">
            <span className="font-headline-sm text-[14px] uppercase font-bold tracking-tight">Escrow Locked Successfully</span>
            <span className="font-mono-data-sm text-[12px]">TX Hash: 0x82f9104b901a...712d9c</span>
            <span className="font-mono-label-xs text-[10px] text-on-primary">STATUS: OPEN // CAD LOCK #0x4B28 COMMITTED</span>
          </div>
        </div>
      )}
    </div>
  );
}
