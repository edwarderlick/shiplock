"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@/lib/wallet";
import { writeIc, verifyCreatedEscrow } from "@/lib/write";
import { parseEther, getAddress } from "viem";
import { CONTRACT_ADDRESS } from "@/lib/env";
import { client } from "@/lib/contract";
import { deriveEscrowId, generateEscrowNonce, validateGithubRepo, validateGithubTag } from "@/lib/escrow";
import { useRouter } from "next/navigation";

export default function LockPage() {
  const { address, selectedProvider } = useWallet();
  const [policy, setPolicy] = useState<"SOURCE_LINKED" | "REGISTRY_ONLY">("SOURCE_LINKED");
  const [template, setTemplate] = useState<"PYPI" | "NPM">("PYPI");
  const [pkg, setPkg] = useState("");
  const [ver, setVer] = useState("");
  const [expectedRepo, setExpectedRepo] = useState("");
  const [expectedTag, setExpectedTag] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  
  const [startUtc, setStartUtc] = useState("");
  const [endUtc, setEndUtc] = useState("");
  
  // Nonce: unique unsigned 256-bit bigint generated before signing and maintained throughout flow
  const [nonce, setNonce] = useState<bigint>(() => generateEscrowNonce());

  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [txProgress, setTxProgress] = useState<string>("REVIEW");
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txExec, setTxExec] = useState<string | null>(null);
  const [verifiedEscrowId, setVerifiedEscrowId] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const now = new Date();
    // 26 hours in the future to safely clear the >= 24h lead-time gate
    const start = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    // 2 days later (well within 1 day - 14 days window span)
    const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
    setStartUtc(start.toISOString().split('.')[0] + 'Z');
    setEndUtc(end.toISOString().split('.')[0] + 'Z');
  }, []);

  const repoValidation = useMemo(() => {
    if (policy !== "SOURCE_LINKED") return { valid: true };
    return validateGithubRepo(expectedRepo);
  }, [policy, expectedRepo]);

  const tagValidation = useMemo(() => {
    if (policy !== "SOURCE_LINKED") return { valid: true };
    return validateGithubTag(expectedTag);
  }, [policy, expectedTag]);

  // Compute expected deterministic escrow ID preview from active inputs
  const expectedEscrowId = useMemo(() => {
    if (!address || !recipient || !pkg || !ver || !startUtc || !endUtc) {
      return null;
    }
    if (policy === "SOURCE_LINKED" && (!repoValidation.valid || !tagValidation.valid || !expectedRepo || !expectedTag)) {
      return null;
    }
    try {
      const normalizedRecipient = getAddress(recipient.trim());
      const value = parseEther(amount || "0");
      return deriveEscrowId({
        funder: address,
        recipient: normalizedRecipient,
        template: `${template}_VERSION`,
        packageName: pkg,
        version: ver,
        windowStartUtc: startUtc,
        windowEndUtc: endUtc,
        amountWei: value,
        nonce,
        policy,
        expectedRepo: policy === "SOURCE_LINKED" ? (repoValidation.normalized || expectedRepo.trim()) : undefined,
        expectedTag: policy === "SOURCE_LINKED" ? expectedTag.trim() : undefined,
      });
    } catch {
      return null;
    }
  }, [address, recipient, pkg, ver, startUtc, endUtc, amount, template, nonce, policy, expectedRepo, expectedTag, repoValidation, tagValidation]);

  const broadcastTransaction = async () => {
    if (!address) {
      alert("Please connect wallet first");
      return;
    }
    if (!recipient || !recipient.trim()) {
      alert("recipient missing");
      return;
    }
    let normalizedRecipient: string;
    try {
      normalizedRecipient = getAddress(recipient.trim());
    } catch {
      alert("invalid recipient address");
      return;
    }

    if (!CONTRACT_ADDRESS) {
      alert("Contract address is not configured. Check NEXT_PUBLIC_CONTRACT_ADDRESS.");
      return;
    }

    if (policy === "SOURCE_LINKED") {
      if (!repoValidation.valid) {
        alert(repoValidation.error || "Invalid expected repository");
        return;
      }
      if (!tagValidation.valid) {
        alert(tagValidation.error || "Invalid expected release tag");
        return;
      }
    }

    setTxProgress("ESTIMATING FEES");
    setTxError(null);
    setTxHash(null);
    setTxStatus(null);
    setTxExec(null);
    setVerifiedEscrowId(null);

    const templateArg = `${template}_VERSION`;
    const pkgArg = pkg.trim();
    const verArg = ver.trim();
    const value = parseEther(amount || "0");
    const isVerified = policy === "SOURCE_LINKED";
    const validatedRepo = isVerified ? repoValidation.normalized! : "";
    const validatedTag = isVerified ? expectedTag.trim() : "";

    // Derive deterministic expected ID before broadcast
    const expectedId = deriveEscrowId({
      funder: address,
      recipient: normalizedRecipient,
      template: templateArg,
      packageName: pkgArg,
      version: verArg,
      windowStartUtc: startUtc,
      windowEndUtc: endUtc,
      amountWei: value,
      nonce,
      policy,
      expectedRepo: isVerified ? validatedRepo : undefined,
      expectedTag: isVerified ? validatedTag : undefined,
    });

    try {
      const { returnedId } = await writeIc({
        account: address,
        provider: selectedProvider,
        functionName: isVerified ? "fund_verified_escrow" : "fund_escrow",
        args: isVerified
          ? [
              templateArg,
              pkgArg,
              verArg,
              validatedRepo,
              validatedTag,
              normalizedRecipient,
              startUtc,
              endUtc,
              nonce,
            ]
          : [
              templateArg,
              pkgArg,
              verArg,
              normalizedRecipient,
              startUtc,
              endUtc,
              nonce,
            ],
        value,
        onProgress: (stage, extra) => {
          setTxProgress(stage);
          if (extra?.hash) setTxHash(extra.hash);
          if (extra?.status) setTxStatus(extra.status);
          if (extra?.exec) setTxExec(extra.exec);
        }
      });

      setTxProgress("VERIFYING ON-CHAIN ESCROW");

      await verifyCreatedEscrow({
        client,
        contractAddress: CONTRACT_ADDRESS,
        expectedId,
        returnedId,
        funder: address,
        recipient: normalizedRecipient,
        template: templateArg,
        packageName: pkgArg,
        version: verArg,
        amountWei: value,
        nonce,
        policy,
        expectedRepo: isVerified ? validatedRepo : undefined,
        expectedTag: isVerified ? validatedTag : undefined,
        maxAttempts: 10,
        intervalMs: 1500,
      });

      setVerifiedEscrowId(expectedId);
      setTxProgress("SUCCESS");

      // Navigate to the verified escrow detail page
      setTimeout(() => {
        router.push(`/escrow/${expectedId}`);
      }, 1000);
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
              <span className="text-primary-fixed">[GAS: TRANSACTION KIT ESTIMATE]</span>
              <span className="text-outline">{"//"}</span>
              <span>GENLAYER CONSENSUS ACTIVE</span>
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
                <span>GENLAYER STUDIO NEXT</span>
              </div>
              <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-primary tracking-tight font-normal">
                Fund Escrow with On-Chain Registry Verification
              </h1>
              <p className="font-body-lg text-body-lg text-secondary mt-space-xs max-w-2xl">
                Lock bounty funds conditioned on verified future release. Verified 404 at funding guarantees the version has not shipped. Payout occurs strictly when the official registry confirms in-window delivery.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN TWO-COLUMN CAD PIPELINE INTERACTION */}
      <section className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
          
          {/* LEFT INTERACTION DOCK: FORM INPUTS */}
          <div className="lg:col-span-7 flex flex-col gap-space-lg">
            
            {/* STEP 01 - VERIFICATION POLICY */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 01</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Verification Policy</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[POLICY: v2 DUAL CONSENSUS]</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                <button
                  type="button"
                  onClick={() => setPolicy("SOURCE_LINKED")}
                  className={`p-space-md border flex flex-col gap-1 transition-all text-left ${
                    policy === "SOURCE_LINKED"
                      ? "border-primary-fixed bg-surface-container text-primary-fixed shadow-md"
                      : "border-outline/20 bg-surface-container-lowest text-on-surface hover:border-outline/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-headline-sm text-[15px] uppercase font-bold">Source-Linked Release</span>
                    <span className="px-1.5 py-0.2 bg-primary-fixed/20 text-primary-fixed text-[10px] font-mono font-bold uppercase">v2 MILESTONE</span>
                  </div>
                  <span className="font-mono-data-sm text-[12px] opacity-80 mt-1">
                    Multi-source: verifies npm/PyPI publish in UTC window AND matching GitHub repository & exact release tag.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPolicy("REGISTRY_ONLY")}
                  className={`p-space-md border flex flex-col gap-1 transition-all text-left ${
                    policy === "REGISTRY_ONLY"
                      ? "border-primary-fixed bg-surface-container text-primary-fixed shadow-md"
                      : "border-outline/20 bg-surface-container-lowest text-on-surface hover:border-outline/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-headline-sm text-[15px] uppercase font-bold">Registry Release</span>
                    <span className="px-1.5 py-0.2 bg-surface-container-high text-on-surface-variant text-[10px] font-mono uppercase">v1 CLASSIC</span>
                  </div>
                  <span className="font-mono-data-sm text-[12px] opacity-80 mt-1">
                    Single source: settles strictly on official package registry metadata within the escrow UTC window.
                  </span>
                </button>
              </div>
            </div>

            {/* STEP 02 - REGISTRY ECOSYSTEM */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 02</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Registry Ecosystem</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[PROTOCOL: CAD_PY_NPM]</span>
              </div>
              <div className="grid grid-cols-2 gap-space-md">
                <button 
                  type="button"
                  onClick={() => setTemplate("PYPI")}
                  className={`p-space-md border flex flex-col gap-1 transition-all ${
                    template === "PYPI" 
                      ? "border-primary-fixed bg-surface-container text-primary-fixed shadow-md" 
                      : "border-outline/20 bg-surface-container-lowest text-on-surface hover:border-outline/40"
                  }`}
                >
                  <span className="font-headline-sm text-[16px] uppercase font-bold">PyPI (Python)</span>
                  <span className="font-mono-data-sm text-[12px] opacity-75">pypi.org/pypi/{"{pkg}"}/{"{ver}"}/json</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setTemplate("NPM")}
                  className={`p-space-md border flex flex-col gap-1 transition-all ${
                    template === "NPM" 
                      ? "border-primary-fixed bg-surface-container text-primary-fixed shadow-md" 
                      : "border-outline/20 bg-surface-container-lowest text-on-surface hover:border-outline/40"
                  }`}
                >
                  <span className="font-headline-sm text-[16px] uppercase font-bold">NPM (Node)</span>
                  <span className="font-mono-data-sm text-[12px] opacity-75">registry.npmjs.org/{"{pkg}"}</span>
                </button>
              </div>
            </div>

            {/* STEP 03 - PACKAGE & TARGET VERSION */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 03</span>
                  <h2 className="font-headline-md text-headline-md text-primary">Package & Target Version</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[LOOKBACK: VERIFIED 404 REQUIRED]</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1">
                  <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">Package Identifier</label>
                  <input 
                    value={pkg}
                    onChange={(e) => setPkg(e.target.value)}
                    placeholder="e.g. flask or @org/pkg"
                    className="bg-surface-container-lowest p-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:ring-1 focus:ring-primary-fixed"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">Target Semver</label>
                  <input 
                    value={ver}
                    onChange={(e) => setVer(e.target.value)}
                    placeholder="e.g. 3.0.0"
                    className="bg-surface-container-lowest p-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:ring-1 focus:ring-primary-fixed"
                  />
                </div>
              </div>
            </div>

            {/* STEP 04 - GITHUB SOURCE RELEASE EVIDENCE (ONLY FOR SOURCE_LINKED) */}
            {policy === "SOURCE_LINKED" && (
              <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md border-l-2 border-primary-fixed">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <span className="px-2 py-0.5 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">STAGE 04</span>
                    <h2 className="font-headline-md text-headline-md text-primary">GitHub Source Evidence</h2>
                  </div>
                  <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed font-bold">[INDEPENDENT EVIDENCE]</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Validators independently query GitHub’s release API to verify the release tag exists and links to this canonical repository.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                  <div className="flex flex-col gap-1">
                    <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">
                      Expected Repository (owner/repo)
                    </label>
                    <input
                      value={expectedRepo}
                      onChange={(e) => setExpectedRepo(e.target.value)}
                      placeholder="e.g. pallets/flask"
                      className="bg-surface-container-lowest p-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:ring-1 focus:ring-primary-fixed"
                    />
                    {expectedRepo.trim() && (
                      <span className={`text-[11px] font-mono mt-0.5 ${repoValidation.valid ? "text-primary-fixed" : "text-error"}`}>
                        {repoValidation.valid ? `✓ Canonical: ${repoValidation.normalized}` : `✗ ${repoValidation.error}`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">
                      Expected Release Tag
                    </label>
                    <input
                      value={expectedTag}
                      onChange={(e) => setExpectedTag(e.target.value)}
                      placeholder="e.g. 3.0.0 or v3.0.0"
                      className="bg-surface-container-lowest p-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:ring-1 focus:ring-primary-fixed"
                    />
                    {expectedTag.trim() && (
                      <span className={`text-[11px] font-mono mt-0.5 ${tagValidation.valid ? "text-primary-fixed" : "text-error"}`}>
                        {tagValidation.valid ? `✓ Valid Git Ref` : `✗ ${tagValidation.error}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-surface-container p-space-xs text-[11px] font-mono text-on-surface-variant flex items-center gap-1.5">
                  <span className="text-primary-fixed font-bold">API ENDPOINT:</span>
                  <span>api.github.com/repos/{repoValidation.normalized || "{owner}/{repo}"}/releases/tags/{expectedTag.trim() || "{tag}"}</span>
                </div>
              </div>
            )}

            {/* STEP 05 - BENEFICIARY ADDRESS */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">
                    {policy === "SOURCE_LINKED" ? "STAGE 05" : "STAGE 04"}
                  </span>
                  <h2 className="font-headline-md text-headline-md text-primary">Beneficiary Address</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[RULE: RECIPIENT != FUNDER]</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">Recipient (0x... 40 Hex)</label>
                <input 
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x..."
                  className="bg-surface-container-lowest p-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:ring-1 focus:ring-primary-fixed"
                />
              </div>
            </div>

            {/* STEP 06 - TIMELINE WINDOWS */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">
                    {policy === "SOURCE_LINKED" ? "STAGE 06" : "STAGE 05"}
                  </span>
                  <h2 className="font-headline-md text-headline-md text-primary">Timeline Windows (UTC)</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[TIMELOCK: 24H LEAD-TIME]</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1">
                  <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">Window Start (UTC)</label>
                  <input 
                    value={startUtc}
                    onChange={(e) => setStartUtc(e.target.value)}
                    className="bg-surface-container-lowest p-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:ring-1 focus:ring-primary-fixed"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider">Window End (UTC)</label>
                  <input 
                    value={endUtc}
                    onChange={(e) => setEndUtc(e.target.value)}
                    className="bg-surface-container-lowest p-space-sm text-primary font-mono-data-sm text-mono-data-sm focus:outline-none focus:ring-1 focus:ring-primary-fixed"
                  />
                </div>
              </div>

              {/* NONCE DISPLAY & REGENERATE */}
              <div className="bg-surface-container p-space-sm flex items-center justify-between font-mono-data-sm text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-outline uppercase">TRANSACTION NONCE:</span>
                  <span className="text-primary-fixed font-mono font-bold select-all">{nonce.toString()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNonce(generateEscrowNonce())}
                  className="px-2 py-0.5 bg-surface-container-highest text-on-surface hover:text-primary-fixed text-mono-label-xs uppercase"
                  title="Generate a new unique nonce"
                >
                  Regenerate Nonce
                </button>
              </div>
            </div>

            {/* STEP 07 - ESCROW LIQUIDITY */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-surface-container text-primary-fixed font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-bold">
                    {policy === "SOURCE_LINKED" ? "STAGE 07" : "STAGE 06"}
                  </span>
                  <h2 className="font-headline-md text-headline-md text-primary">Escrow Liquidity</h2>
                </div>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">[TOKEN: GEN NATIVE]</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono-label-xs text-mono-label-xs uppercase text-on-surface-variant tracking-wider flex justify-between">
                  <span>PRINCIPAL LOCK AMOUNT</span>
                </label>
                <div className="relative flex items-center bg-surface-container-lowest">
                  <span className="material-symbols-outlined text-outline text-[18px] ml-space-md">lock</span>
                  <input 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-transparent px-space-md py-space-sm text-primary font-mono-metric-md text-mono-metric-md focus:outline-none focus:text-primary-fixed" 
                    type="number" 
                    step="1.0"
                    placeholder="10.0"
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
                    <strong>100% payout</strong> to recipient if verified <span className="text-primary-fixed">RELEASED</span> within active window. <strong>100% full refund</strong> directly to funder on <span className="text-error">REFUND_NOHIT</span>, <span className="text-secondary">CANCELED</span>, or <span className="text-secondary">EXPIRED</span>. Zero protocol haircut, zero arbiter split, zero custodial hold.
                  </p>
                </div>
              </div>
            </div>

            {/* STEP 08 - FINAL VERIFICATION & COMMIT */}
            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="px-2 py-0.5 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs uppercase tracking-wider font-black">
                    {policy === "SOURCE_LINKED" ? "STAGE 08" : "STAGE 07"}
                  </span>
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
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  disabled={
                    !CONTRACT_ADDRESS ||
                    !address ||
                    address.length !== 42 ||
                    !recipient ||
                    recipient.length !== 42 ||
                    recipient.toLowerCase() === address?.toLowerCase() ||
                    !amount ||
                    parseFloat(amount) <= 0 ||
                    (policy === "SOURCE_LINKED" && (!repoValidation.valid || !tagValidation.valid))
                  }
                  className="px-space-xl py-space-md bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary font-headline-sm text-headline-sm uppercase tracking-tight flex items-center justify-center gap-space-sm transition-all shadow-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{!CONTRACT_ADDRESS ? "CONTRACT ADDRESS MISSING" : `Review & Lock ${parseFloat(amount || "0").toFixed(2)} test GEN`}</span>
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
                <span className="font-mono-label-xs text-mono-label-xs uppercase tracking-widest text-on-primary font-bold">DERIVED ESCROW ID PREVIEW</span>
                <div className="font-mono-data-sm text-mono-data-sm font-bold tracking-tight break-all text-on-primary-container mt-1">
                  {expectedEscrowId || "AWAITING COMPLETE INPUTS..."}
                </div>
                <span className="font-mono-data-sm text-[11px] text-on-primary mt-2">
                  Deterministic SHA256 derived from funder, recipient, template, package, semver, {policy === "SOURCE_LINKED" ? "repo, tag, " : ""}dates, amount, and nonce.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-space-sm pt-space-md bg-on-primary-container/10 p-space-sm">
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary">SETTLEMENT POLICY</span>
                  <span className="font-mono-data-sm text-[11px] font-bold text-on-primary-container uppercase">
                    {policy === "SOURCE_LINKED" ? "Source-Linked v2" : "Registry v1"}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary">VERIFICATION</span>
                  <span className="font-mono-metric-md text-mono-metric-md font-bold text-on-primary-container">
                    {policy === "SOURCE_LINKED" ? "Dual-source consensus" : "Validator consensus"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between pb-space-xs bg-surface-container-lowest px-space-sm py-1">
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-wider font-bold">
                  CAD SPECIFICATION INSPECTOR
                </span>
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant font-mono">
                  {CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}` : "NOT WIRED"}
                </span>
              </div>

              <div className="flex flex-col gap-1 font-mono-data-sm text-mono-data-sm">
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Policy</span>
                  <span className="text-primary-fixed font-semibold">
                    {policy === "SOURCE_LINKED" ? "SOURCE_LINKED (v2)" : "REGISTRY_ONLY (v1)"}
                  </span>
                </div>
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
                {policy === "SOURCE_LINKED" && (
                  <>
                    <div className="flex items-center justify-between p-space-xs bg-surface-container">
                      <span className="text-on-surface-variant">Expected GitHub Repo</span>
                      <span className="text-primary-fixed font-semibold truncate max-w-[180px]">{repoValidation.normalized || "required"}</span>
                    </div>
                    <div className="flex items-center justify-between p-space-xs bg-surface-container">
                      <span className="text-on-surface-variant">Expected Release Tag</span>
                      <span className="text-primary-fixed font-semibold truncate max-w-[180px]">{expectedTag.trim() || "required"}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Evaluation Window</span>
                  <span className="text-on-surface">48 Hours (2.0 Days)</span>
                </div>
                <div className="flex items-center justify-between p-space-xs bg-surface-container">
                  <span className="text-on-surface-variant">Escrow State Initialization</span>
                  <span className="px-2 py-0.5 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs font-bold uppercase">OPEN</span>
                </div>
              </div>

              <div className="bg-surface-container-lowest p-space-md flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary-fixed text-[20px]">verified_user</span>
                <div className="flex flex-col">
                  <span className="font-headline-sm text-[12px] uppercase text-primary">Intelligent Contract Execution</span>
                  <span className="font-mono-data-sm text-[11px] text-on-surface-variant">
                    {policy === "SOURCE_LINKED"
                      ? "Dual-source equivalence consensus across official registry and GitHub release."
                      : "Zero custody Intelligent Contract on GenLayer Studio Next."}
                  </span>
                </div>
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
                type="button"
                onClick={() => {
                  if (txProgress === "REVIEW" || txProgress === "FAILED" || txProgress === "SUCCESS") {
                    setIsModalOpen(false);
                  }
                }}
                className="w-8 h-8 bg-surface-container flex items-center justify-center text-on-surface hover:text-primary-fixed"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <div className="bg-surface-container p-space-md flex flex-col gap-space-xs font-mono-data-sm text-mono-data-sm">
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>VERIFICATION POLICY</span>
                <span className="text-primary-fixed font-bold">
                  {policy === "SOURCE_LINKED" ? "Source-Linked Verified Release (v2)" : "Registry Release (v1)"}
                </span>
              </div>
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>REGISTRY</span>
                <span className="text-on-surface font-semibold">{template === 'PYPI' ? 'PyPI (Python Package Index)' : 'NPM (Node Package Manager)'}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>TARGET ARTIFACT</span>
                <span className="text-primary-fixed font-semibold">{pkg} @ {ver}</span>
              </div>
              {policy === "SOURCE_LINKED" && (
                <>
                  <div className="flex justify-between text-on-surface-variant pb-1">
                    <span>EXPECTED GITHUB REPO</span>
                    <span className="text-primary-fixed font-semibold font-mono">{repoValidation.normalized}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant pb-1">
                    <span>EXPECTED RELEASE TAG</span>
                    <span className="text-primary-fixed font-semibold font-mono">{expectedTag.trim()}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>BENEFICIARY ADDRESS</span>
                <span className="text-on-surface font-mono">{recipient || "0x..."}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>RELEASE WINDOW</span>
                <span className="text-on-surface">{startUtc} — {endUtc}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>TRANSACTION NONCE</span>
                <span className="text-primary-fixed font-mono">{nonce.toString()}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pb-1">
                <span>EXPECTED ESCROW ID</span>
                <span className="text-on-surface font-mono text-[11px] break-all">{expectedEscrowId || "N/A"}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant pt-2 bg-surface-container-lowest p-space-xs">
                <span className="text-primary-fixed font-bold">PRINCIPAL ESCROW AMOUNT</span>
                <span className="text-primary-fixed font-bold text-mono-metric-md">{parseFloat(amount || "0").toFixed(2)} TEST GEN</span>
              </div>
            </div>

            <div className="p-space-sm bg-surface-container-lowest text-on-surface-variant font-mono-data-sm text-[11px] flex flex-col gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary-fixed text-[18px]">info</span>
                <span>
                  {policy === "SOURCE_LINKED"
                    ? <span>Action calls <code>fund_verified_escrow(template, pkg, ver, repo, tag, recipient, start, end, nonce)</code> on GenLayer Studio Next (61997).</span>
                    : <span>Action calls <code>fund_escrow(template, pkg, ver, recipient, start, end, nonce)</code> on GenLayer Studio Next (61997).</span>}
                </span>
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
                  {verifiedEscrowId && (
                    <div className="text-primary-fixed mt-1">
                      Escrow verified on-chain: <span className="font-mono">{verifiedEscrowId}</span>. Redirecting...
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
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setTxProgress("REVIEW");
                  setTxError(null);
                  setTxHash(null);
                  setTxStatus(null);
                  setTxExec(null);
                }}
                disabled={txProgress !== 'REVIEW' && txProgress !== 'FAILED'}
                className="px-space-md py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface font-headline-sm text-body-md uppercase disabled:opacity-50"
              >
                Abort
              </button>
              <button 
                type="button"
                onClick={broadcastTransaction}
                disabled={txProgress !== 'REVIEW' && txProgress !== 'FAILED'}
                className="px-space-xl py-space-md bg-primary-container text-on-primary-container hover:bg-primary font-headline-sm text-headline-sm uppercase font-bold flex items-center gap-space-xs shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{txProgress === "REVIEW" || txProgress === "FAILED" ? "Execute & Broadcast TX" : "Processing..."}</span>
                <span className="material-symbols-outlined text-[18px]">bolt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
