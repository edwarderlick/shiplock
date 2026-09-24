"use client";

import Link from "next/link";
import React from "react";

export default function Home() {
  return (
    <div className="flex flex-col w-full relative min-h-[calc(100vh-4rem)]">
      {/* Subtle Background Scenery: Industrial Escrow Telemetry Canvas (Simulated Underlay) */}
      <div className="absolute inset-0 bg-surface pointer-events-none select-none overflow-hidden opacity-30 flex flex-col justify-between p-margin-sm md:p-margin">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
          <div className="p-space-lg bg-surface-container-low flex flex-col gap-space-xs">
            <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-widest">[REGISTRY TELEMETRY]</span>
            <div className="font-mono-metric-md text-mono-metric-md text-primary">1,492 ACTIVE LOCKS</div>
            <span className="font-mono-data-sm text-mono-data-sm text-outline">ORACLE CONSENSUS: VERIFIED</span>
          </div>
          <div className="p-space-lg bg-surface-container-low flex flex-col gap-space-xs">
            <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-widest">[SETTLEMENT CADENCE]</span>
            <div className="font-mono-metric-md text-mono-metric-md text-primary">0.428s MEAN SLA</div>
            <span className="font-mono-data-sm text-mono-data-sm text-outline">VALIDATION LATENCY: OPTIMAL</span>
          </div>
          <div className="p-space-lg bg-surface-container-low flex flex-col gap-space-xs">
            <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-widest">[TOTAL TEST POOL]</span>
            <div className="font-mono-metric-md text-mono-metric-md text-primary-fixed">94,204.00 GEN</div>
            <span className="font-mono-data-sm text-mono-data-sm text-outline">ESCROWED NOTARIZATIONS</span>
          </div>
          <div className="p-space-lg bg-surface-container-low flex flex-col gap-space-xs">
            <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase tracking-widest">[ORACLE NODES]</span>
            <div className="font-mono-metric-md text-mono-metric-md text-primary">05 / 05 QUORUM</div>
            <span className="font-mono-data-sm text-mono-data-sm text-outline">LEADERLESS ROUNDS ACTIVE</span>
          </div>
        </div>
        {/* Isometric Vector Telemetry Backdrop */}
        <div className="w-full flex items-center justify-center my-space-xl">
          <svg className="w-full max-w-4xl h-64 text-on-surface-variant/20" fill="none" viewBox="0 0 800 240">
            <path d="M50 120 L250 40 L550 40 L750 120 L550 200 L250 200 Z" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1"></path>
            <path d="M250 40 L250 200 M550 40 L550 200" stroke="currentColor" strokeWidth="1"></path>
            <circle cx="250" cy="120" fill="currentColor" r="4"></circle>
            <circle cx="550" cy="120" fill="currentColor" r="4"></circle>
            <line stroke="currentColor" strokeWidth="0.5" x1="100" x2="700" y1="120" y2="120"></line>
            <text className="font-mono-label-xs text-[10px]" fill="currentColor" x="260" y="115">NODE_SYS_REF // CAD_4B91</text>
            <text className="font-mono-label-xs text-[10px]" fill="currentColor" x="560" y="115">ESCROW_DISPATCH // 0x61997</text>
          </svg>
        </div>
        <div className="flex justify-between font-mono-label-xs text-mono-label-xs text-outline">
          <span>LAT: 37.7749 // LON: -122.4194</span>
          <span>RUNTIME_VERSION: CAD_STUDIO_NEXT_v2.4.9</span>
          <span>GENLAYER DEVNET TELEMETRY RUNNING</span>
        </div>
      </div>

      {/* PRE-LAUNCH NETWORK NOTIFICATION STRIP */}
      <div className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-xs flex flex-wrap items-center justify-between gap-space-sm text-on-surface-variant font-mono-label-xs text-mono-label-xs uppercase relative z-10">
        <div className="flex items-center gap-space-sm">
          <span className="inline-flex w-2 h-2 rounded-full bg-primary-fixed"></span>
          <span className="text-on-surface">GENLAYER STUDIO NEXT TESTNET (CHAIN ID 61997)</span>
          <span className="text-outline">/</span>
          <span className="text-primary-fixed">PERMISSIONLESS CAD RUNTIME</span>
        </div>
        <div className="flex items-center gap-space-md">
          <span>TEST GEN ONLY — ZERO PROTOCOL SLIPPAGE</span>
          <span className="hidden sm:inline text-outline">[SYS_REV: v2.4.9-DEV]</span>
        </div>
      </div>

      {/* HERO SECTION */}
      <section className="w-full bg-surface relative overflow-hidden z-10">
        <div className="w-full px-margin-sm md:px-margin grid grid-cols-1 lg:grid-cols-12 min-h-[680px]">
          {/* LEFT ANCHOR PILLAR */}
          <div className="lg:col-span-3 bg-primary-container text-on-primary-fixed p-space-lg flex flex-col justify-between relative shadow-xl">
            <div className="flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs tracking-widest uppercase text-on-primary-fixed font-bold">[CAD_LOCK v2]</span>
                <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary-fixed font-medium">INDEX // 0x61997</span>
              </div>
              <div className="pt-space-md flex flex-col gap-space-xs">
                <span className="font-mono-metric-md text-mono-metric-md text-on-primary-fixed leading-none font-semibold">SHIPLOCK</span>
                <p className="font-body-md text-body-md text-on-primary-fixed/80 leading-snug">
                  Time-gated registry-publication smart escrow on GenLayer Studio Next.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-space-lg pt-space-xl">
              <div className="flex flex-col gap-1">
                <span className="font-mono-data-sm text-mono-data-sm uppercase tracking-wider text-on-primary-fixed/70">ORACLE QUORUM</span>
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-on-primary-fixed leading-none">5/5</span>
                  <span className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary-fixed/80 font-bold">LEADERLESS</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono-data-sm text-mono-data-sm uppercase tracking-wider text-on-primary-fixed/70">DISBURSEMENT SLA</span>
                <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-on-primary-fixed leading-none">&lt; 1.2s</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono-data-sm text-mono-data-sm uppercase tracking-wider text-on-primary-fixed/70">PROTOCOL FEE</span>
                <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-on-primary-fixed leading-none">0.00%</span>
              </div>
              <div className="pt-space-sm">
                <div className="bg-surface-container-lowest text-primary px-space-md py-space-sm flex items-center justify-between shadow-md">
                  <span className="font-mono-label-xs text-mono-label-xs tracking-wider uppercase text-primary-fixed">DEPLOYED: 0x90A...11F4</span>
                  <span className="material-symbols-outlined text-[16px] text-primary-fixed">verified</span>
                </div>
              </div>
            </div>
          </div>
          {/* RIGHT HERO CORE */}
          <div className="lg:col-span-9 bg-surface-container-lowest p-space-lg md:p-space-xl flex flex-col justify-between relative shadow-2xl">
            <div className="absolute right-6 top-6 font-mono-label-xs text-mono-label-xs text-on-surface-variant/40 tracking-widest hidden sm:block">
              GRID_COORD [LAT: 42.1009 // LNG: -71.0589]
            </div>
            <div className="flex flex-col gap-space-lg max-w-4xl pt-space-xs">
              <div className="flex items-center gap-space-sm font-mono-label-xs text-mono-label-xs tracking-widest text-primary-fixed uppercase">
                <span className="w-2 h-2 bg-primary-fixed"></span>
                <span>AUTONOMOUS SMART ESCROW // DETERMINISTIC PIPELINE</span>
              </div>
              <h1 className="font-display-xl text-display-xl tracking-tight text-primary leading-none">
                Your package release, <span className="italic text-primary-fixed">escrowed.</span>
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                Autonomous smart escrow on GenLayer Studio Next. A funder locks test GEN against a targeted semver package identity on PyPI or npm. Zero human arbiters. 100% deterministic code execution.
              </p>
              <div className="flex flex-wrap items-center gap-space-md pt-space-sm">
                <Link href="/lock" className="bg-primary-container text-on-primary-container font-body-md text-body-md px-space-xl py-3 font-semibold uppercase tracking-wider flex items-center gap-space-sm shadow-md hover:bg-primary transition-colors">
                  <span>Enter App & Lock Escrow</span>
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </Link>
                <a className="bg-surface-container-low text-on-surface font-body-md text-body-md px-space-lg py-3 uppercase tracking-wider hover:bg-surface-bright transition-colors flex items-center gap-space-sm" href="#schematic">
                  <span className="material-symbols-outlined text-[18px]">terminal</span>
                  <span>How ShipLock Works</span>
                </a>
              </div>
            </div>
            {/* ISOMETRIC CAD VERIFICATION WIREFRAME SCHEMATIC (SVG) */}
            <div className="w-full mt-space-xl pt-space-md relative bg-surface-container-low/50 p-space-md shadow-inner">
              <div className="flex items-center justify-between pb-space-sm font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-primary-fixed rounded-full"></span>TELEMETRY SCHEMATIC: GENLAYER LEADERSHIPLESS AUDIT CHOREOGRAPHY</span>
                <span>SCALE: 1:1 ORTHO</span>
              </div>
              <svg className="w-full h-auto text-primary" fill="none" viewBox="0 0 1000 240" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 200 L500 230 L950 200 L500 170 Z" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1"></path>
                <path d="M120 195 L500 220 L880 195 L500 175 Z" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1"></path>
                <g transform="translate(60, 40)">
                  <rect fill="#1c1b1b" height="90" stroke="#353534" strokeWidth="1" width="180" x="0" y="0"></rect>
                  <rect fill="#d8ee48" height="4" width="180" x="0" y="0"></rect>
                  <text fill="#d8ee48" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="1" x="14" y="24">CHAMBER 01: LOCK</text>
                  <text fill="#ffffff" fontFamily="Space Grotesk" fontSize="13" fontWeight="600" x="14" y="44">DEPOSIT TEST GEN</text>
                  <text fill="#c7c8af" fontFamily="JetBrains Mono" fontSize="10" x="14" y="62">24h Pre-Window Timelock</text>
                  <text fill="#91927b" fontFamily="JetBrains Mono" fontSize="9" x="14" y="78">State: OPEN // IN-CAD</text>
                </g>
                <path d="M240 85 L360 85" stroke="#91927b" strokeDasharray="4 3" strokeWidth="1.5"></path>
                <polygon fill="#d8ee48" points="360,85 352,81 352,89"></polygon>
                <g transform="translate(370, 20)">
                  <rect fill="#201f1f" height="130" stroke="#464835" strokeWidth="1" width="220" x="0" y="0"></rect>
                  <text fill="#d8ee48" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="1" x="14" y="22">CHAMBER 02: ORACLE QUORUM</text>
                  <text fill="#ffffff" fontFamily="Space Grotesk" fontSize="14" fontWeight="600" x="14" y="42">Direct Registry Ingest</text>
                  <line stroke="#353534" strokeWidth="1" x1="14" x2="206" y1="52" y2="52"></line>
                  <rect fill="#131313" height="24" width="92" x="14" y="62"></rect>
                  <text fill="#e5e2e1" fontFamily="JetBrains Mono" fontSize="10" x="22" y="77">PyPI JSON 200</text>
                  <circle cx="96" cy="74" fill="#d8ee48" r="3"></circle>
                  <rect fill="#131313" height="24" width="92" x="114" y="62"></rect>
                  <text fill="#e5e2e1" fontFamily="JetBrains Mono" fontSize="10" x="122" y="77">npm Registry</text>
                  <circle cx="196" cy="74" fill="#d8ee48" r="3"></circle>
                  <text fill="#c7c8af" fontFamily="JetBrains Mono" fontSize="9" x="14" y="106">GenLayer Leaderless Consensus</text>
                  <text fill="#91927b" fontFamily="JetBrains Mono" fontSize="9" x="14" y="120">Evaluates: Status + Yank Bit</text>
                </g>
                <path d="M590 85 L710 85" stroke="#91927b" strokeDasharray="4 3" strokeWidth="1.5"></path>
                <polygon fill="#d8ee48" points="710,85 702,81 702,89"></polygon>
                <g transform="translate(720, 35)">
                  <rect fill="#1c1b1b" height="100" stroke="#353534" strokeWidth="1" width="220" x="0" y="0"></rect>
                  <rect fill="#ffffff" height="4" width="220" x="0" y="0"></rect>
                  <text fill="#d8ee48" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="1" x="14" y="24">CHAMBER 03: SETTLEMENT</text>
                  <text fill="#ffffff" fontFamily="Space Grotesk" fontSize="13" fontWeight="600" x="14" y="44">BIFURCATED ROUTING</text>
                  <text fill="#c7c8af" fontFamily="JetBrains Mono" fontSize="10" x="14" y="65">Match: 100% -&gt; Maintainer</text>
                  <text fill="#ffb4ab" fontFamily="JetBrains Mono" fontSize="10" x="14" y="82">Yank/Miss: 100% -&gt; Funder</text>
                </g>
              </svg>
              <div className="grid grid-cols-3 gap-space-sm pt-space-xs text-on-surface-variant font-mono-data-sm text-mono-data-sm">
                <div>01 // FUNDER DEPOSIT ESCROW</div>
                <div className="text-center">02 // AUTONOMOUS AUDIT QUORUM</div>
                <div className="text-right">03 // INSTANT SETTLEMENT</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROTOCOL TELEMETRY BAR */}
      <div className="w-full bg-surface-container-high px-margin-sm md:px-margin py-space-sm grid grid-cols-2 md:grid-cols-4 gap-space-md z-10 relative">
        <div className="flex flex-col">
          <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">ACTIVE MONITORED ARTIFACTS</span>
          <span className="font-mono-metric-md text-mono-metric-md text-primary">142 PACKAGES</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">TOTAL TEST ESCROW LOCKED</span>
          <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed">148,920 GEN</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">AUTONOMOUS SETTLEMENT ACCURACY</span>
          <span className="font-mono-metric-md text-mono-metric-md text-primary">100.00%</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">CONSENSUS LATENCY</span>
          <span className="font-mono-metric-md text-mono-metric-md text-on-surface">380 MS</span>
        </div>
      </div>

      {/* LIVE ESCROW FIXTURES STRIP */}
      <section className="w-full bg-surface-container-low py-space-xl px-margin-sm md:px-margin z-10 relative">
        <div className="w-full flex flex-col gap-space-md mb-space-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="w-3 h-3 bg-primary-fixed"></span>
              <h2 className="font-headline-sm text-headline-sm uppercase tracking-tight text-primary">Live Protocol Escrow Chambers</h2>
            </div>
            <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">CHAIN: 61997 // STREAMING TESTNET DATA</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Permissionless resolution triggers verify official registry metadata and disburse principal instantly. Inspect sample locks below.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-center">
          {/* FLANK LEFT: RESOLVED SUCCESS LOCK */}
          <div className="lg:col-span-4 bg-surface-container p-space-md shadow-md flex flex-col justify-between min-h-[300px]">
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs bg-surface-container-highest text-secondary px-space-xs py-0.5 uppercase">RELEASED // 100% PAID</span>
                <span className="font-mono-label-xs text-mono-label-xs text-outline">ESCROW #082</span>
              </div>
              <div className="pt-space-xs flex flex-col">
                <span className="font-headline-sm text-headline-sm text-primary">pydantic-xml-rpc</span>
                <span className="font-mono-data-sm text-mono-data-sm text-primary-fixed">v1.2.0 (PyPI Verified)</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant pt-space-xs">
                Published within window, un-yanked. Consensus confirmed registry ingest sha256. 100% principal settled to maintainer wallet.
              </p>
            </div>
            <div className="pt-space-md flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm">
              <div className="flex justify-between font-mono-data-sm text-mono-data-sm">
                <span className="text-on-surface-variant">Escrow Principal:</span>
                <span className="text-primary font-medium">1,250.00 GEN</span>
              </div>
              <div className="flex justify-between font-mono-data-sm text-mono-data-sm">
                <span className="text-on-surface-variant">Settled In:</span>
                <span className="text-primary-fixed">Block #88,291</span>
              </div>
            </div>
          </div>

          {/* CENTER RAISED: RIPE OPEN LOCK */}
          <div className="lg:col-span-4 bg-surface-container-highest p-space-lg shadow-2xl -mt-2 lg:-mt-4 relative flex flex-col justify-between min-h-[360px]">
            <div className="absolute top-0 right-0 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs font-bold px-space-sm py-1 uppercase">
              RIPE FOR AUDIT
            </div>
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-primary-fixed animate-ping"></span>
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed font-bold uppercase">WINDOW MATURED // CALL TRIGGER</span>
              </div>
              <div className="pt-space-xs flex flex-col">
                <span className="font-headline-md text-headline-md text-primary">fastapi-auth-guards</span>
                <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed">target: v0.4.2</span>
              </div>
              <div className="bg-surface-container-low p-space-sm flex flex-col gap-1 font-mono-data-sm text-mono-data-sm text-on-surface">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Registry:</span>
                  <span className="text-on-surface">PyPI Live Registry</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Escrow Locked:</span>
                  <span className="text-primary-fixed font-semibold">2,500.00 GEN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Funder:</span>
                  <span className="text-secondary truncate max-w-[140px]">0x71C...3A9f</span>
                </div>
              </div>
            </div>
            <div className="pt-space-md flex flex-col gap-space-sm">
              <button className="w-full py-space-sm bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs font-bold tracking-wider uppercase flex items-center justify-center gap-space-xs hover:bg-primary transition-colors">
                <span className="material-symbols-outlined text-[16px]">play_circle</span>
                <span>TRIGGER AUDIT & RELEASE (PERMISSIONLESS)</span>
              </button>
              <span className="text-center font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">Caller earns gas rebate via GenLayer Studio</span>
            </div>
          </div>

          {/* FLANK RIGHT: REFUNDED MISSING VERSION */}
          <div className="lg:col-span-4 bg-surface-container p-space-md shadow-md flex flex-col justify-between min-h-[300px]">
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs bg-error-container text-on-error-container px-space-xs py-0.5 uppercase">REFUNDED // TIMEOUT</span>
                <span className="font-mono-label-xs text-mono-label-xs text-outline">ESCROW #079</span>
              </div>
              <div className="pt-space-xs flex flex-col">
                <span className="font-headline-sm text-headline-sm text-primary">@core/router-flux</span>
                <span className="font-mono-data-sm text-mono-data-sm text-error">v3.0.0 (npm Not Published)</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant pt-space-xs">
                Window expired without valid publication on npm registry. Oracle consensus confirmed missing release. 100% principal refunded to depositor.
              </p>
            </div>
            <div className="pt-space-md flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm">
              <div className="flex justify-between font-mono-data-sm text-mono-data-sm">
                <span className="text-on-surface-variant">Escrow Principal:</span>
                <span className="text-primary font-medium">850.00 GEN</span>
              </div>
              <div className="flex justify-between font-mono-data-sm text-mono-data-sm">
                <span className="text-on-surface-variant">Action:</span>
                <span className="text-error">100% Refund Disbursed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EDITORIAL SPLIT VALUE PROPOSITIONS */}
      <section className="w-full bg-surface py-space-xl px-margin-sm md:px-margin z-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-lg items-end">
          <div className="lg:col-span-8 flex flex-col gap-space-xs">
            <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-widest">[SYSTEM SPECIFICATION]</span>
            <h2 className="font-headline-lg text-headline-lg text-primary">
              We build the layer between public package registries and escrow, so funding only flows when code actually lands.
            </h2>
          </div>
          <div className="lg:col-span-4 flex flex-col gap-space-xs">
            <p className="font-body-md text-body-md text-on-surface-variant">
              Most bounties rely on discretionary multi-sigs or off-chain trust. ShipLock maps GenLayer&apos;s leaderless consensus directly to public package registries.
            </p>
          </div>
        </div>

        {/* THREE PILLARS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          <div className="bg-surface-container-low p-space-lg flex flex-col justify-between shadow-md relative group hover:bg-surface-container transition-colors">
            <div className="flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed font-bold">01</span>
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">OFFICIAL FEEDS</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-primary">Deterministic Registry Feeds</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                PyPI and npm official JSON APIs are queried directly by GenLayer leaderless consensus. No human arbiter, no subjective tribunal, no DAO vote delays.
              </p>
            </div>
            <div className="pt-space-xl flex items-center justify-between font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">
              <span>SOURCE: JSON SCHEMA</span>
              <span className="text-primary-fixed">HTTP 200 PROOF</span>
            </div>
          </div>

          <div className="bg-surface-container p-space-lg flex flex-col justify-between shadow-xl relative group">
            <div className="flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed font-bold">02</span>
                <span className="font-mono-label-xs text-mono-label-xs bg-primary-container text-on-primary-container px-space-xs font-bold uppercase">ZERO SLIPPAGE</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-primary">100% Principal Routing</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Binary settlement. Either 100% payout to recipient upon verified, un-yanked artifact release in-window, or 100% refund to depositor on failure. Zero cut extracted.
              </p>
            </div>
            <div className="pt-space-xl flex items-center justify-between font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">
              <span>PROTOCOL CUT: 0%</span>
              <span className="text-primary-fixed">100% DISBURSEMENT</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-lg flex flex-col justify-between shadow-md relative group hover:bg-surface-container transition-colors">
            <div className="flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed font-bold">03</span>
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">TIMELOCK PROTOCOL</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-primary">Anti-Frontrun Timelocks</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Strict 24h pre-window deposit gates ensure nobody can deposit against already published packages. Releases must occur strictly within the authorized window.
              </p>
            </div>
            <div className="pt-space-xl flex items-center justify-between font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">
              <span>MIN PRE-GATE: 24 HOURS</span>
              <span className="text-primary-fixed">SPOOF PROOF</span>
            </div>
          </div>
        </div>
      </section>

      {/* STEP-BY-STEP SCHEMATIC CONVEYOR */}
      <section className="w-full bg-surface-container-lowest py-space-xl px-margin-sm md:px-margin z-10 relative" id="schematic">
        <div className="w-full flex flex-col gap-space-xs mb-space-xl">
          <div className="flex items-center gap-space-sm font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-widest">
            <span className="w-2 h-2 bg-primary-fixed"></span>
            <span>PROTOCOL CAD EXECUTION CYCLE</span>
          </div>
          <h2 className="font-display-lg text-display-lg text-primary">
            From artifact intent to escrow payout in five states.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-space-sm">
          <div className="bg-surface-container-low p-space-md flex flex-col justify-between min-h-[220px]">
            <div className="flex flex-col gap-space-xs">
              <span className="font-mono-metric-md text-mono-metric-md text-on-surface-variant">01</span>
              <span className="font-headline-sm text-headline-sm text-primary">Define Target</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant pt-space-xs">
                Funder selects PyPI or npm package name, exact semver tag, and sets resolution expiration timestamp.
              </p>
            </div>
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">CONFIG LOCKED</span>
          </div>

          <div className="bg-surface-container-low p-space-md flex flex-col justify-between min-h-[220px]">
            <div className="flex flex-col gap-space-xs">
              <span className="font-mono-metric-md text-mono-metric-md text-on-surface-variant">02</span>
              <span className="font-headline-sm text-headline-sm text-primary">Lock Test GEN</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant pt-space-xs">
                Principal is deposited into ShipLock smart contract before the mandatory 24-hour pre-window timelock.
              </p>
            </div>
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">VAULT SEALED</span>
          </div>

          <div className="bg-surface-container-low p-space-md flex flex-col justify-between min-h-[220px]">
            <div className="flex flex-col gap-space-xs">
              <span className="font-mono-metric-md text-mono-metric-md text-on-surface-variant">03</span>
              <span className="font-headline-sm text-headline-sm text-primary">Window Opens</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant pt-space-xs">
                Developer publishes package to public registry. Package tarball SHA256 and release date are indexed.
              </p>
            </div>
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">CAD ACTIVE</span>
          </div>

          <div className="bg-surface-container-low p-space-md flex flex-col justify-between min-h-[220px]">
            <div className="flex flex-col gap-space-xs">
              <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed">04</span>
              <span className="font-headline-sm text-headline-sm text-primary">Permissionless Release</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant pt-space-xs">
                Anyone triggers smart contract check. GenLayer leaderless consensus fetches and verifies live registry JSON.
              </p>
            </div>
            <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase">CONSENSUS CALL</span>
          </div>

          <div className="bg-primary-container text-on-primary-fixed p-space-md flex flex-col justify-between min-h-[220px] shadow-lg">
            <div className="flex flex-col gap-space-xs">
              <span className="font-mono-metric-md text-mono-metric-md text-on-primary-fixed font-bold">05</span>
              <span className="font-headline-sm text-headline-sm text-on-primary-fixed font-bold">Disbursement</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-primary-fixed/80 pt-space-xs">
                Deterministic resolution: 100% funds released to maintainer if valid, or 100% returned to funder if missing.
              </p>
            </div>
            <span className="font-mono-label-xs text-mono-label-xs text-on-primary-fixed uppercase font-bold">ZERO RESIDUAL ESCROW</span>
          </div>
        </div>
      </section>

      {/* CALL TO ACTION PANEL */}
      <section className="w-full bg-surface py-space-xl px-margin-sm md:px-margin z-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-high shadow-2xl">
          <div className="lg:col-span-8 p-space-lg md:p-space-xl flex flex-col justify-between gap-space-lg">
            <div className="flex flex-col gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-widest">[DEPLOY // TESTNET 61997]</span>
              <h3 className="font-headline-lg text-headline-lg text-primary">
                Ready to tie development grants to verifiable package shipments?
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-xl">
                Test the entire escrow pipeline without spending real assets. GenLayer Studio Next provides instant RPC execution, sub-second telemetry, and complete contract visibility.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-space-md">
              <Link href="/lock" className="bg-primary-container text-on-primary-container font-body-md text-body-md px-space-xl py-3 font-semibold uppercase tracking-wider hover:bg-primary transition-colors flex items-center gap-space-sm">
                <span>Launch App & Create Lock</span>
                <span className="material-symbols-outlined text-[18px]">arrow_outward</span>
              </Link>
              <a className="bg-surface-container-low text-on-surface font-body-md text-body-md px-space-md py-3 uppercase tracking-wider hover:bg-surface-bright transition-colors flex items-center gap-space-xs" href="https://studio-dev.genlayer.com" target="_blank" rel="noopener noreferrer">
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                <span>GenLayer Studio RPC</span>
              </a>
            </div>
          </div>
          <div className="lg:col-span-4 bg-surface-container-lowest p-space-lg flex flex-col justify-between shadow-inner">
            <div className="flex flex-col gap-space-md">
              <div className="flex flex-col gap-1 pt-space-md font-mono-data-sm text-mono-data-sm">
                <div className="flex justify-between text-on-surface-variant">
                  <span>ORACLE MODE</span>
                  <span className="text-primary-fixed">HTTP CONSENSUS</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>SUPPORTED REGISTRIES</span>
                  <span className="text-on-surface">PyPI, npm</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>SETTLEMENT ENGINE</span>
                  <span className="text-on-surface">CAD_v2.4.9</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>CONTRACT STATUS</span>
                  <span className="text-primary-fixed">DEPLOYED</span>
                </div>
              </div>
            </div>
            <div className="pt-space-xl flex flex-col gap-1">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">CAD SCHEMATIC REF:</span>
              <span className="font-mono-data-sm text-mono-data-sm text-secondary truncate">0x4B29...GEN61997_DEV_ESCR</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
