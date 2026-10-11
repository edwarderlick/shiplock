"use client";

import React from "react";
import Link from "next/link";
import { CONTRACT_ADDRESS } from "@/lib/env";

export default function Home() {
  const contractDisplay = CONTRACT_ADDRESS
    ? `${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}`
    : "NOT WIRED";

  return (
    <div className="flex flex-col w-full text-on-surface">
      {/* CAD OPERATIONAL CONTROL BAR */}
      <section className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-sm border-b border-outline/10">
        <div className="w-full flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-sm font-mono-data-sm text-mono-data-sm">
          <div className="flex flex-wrap items-center gap-space-md">
            <div className="flex items-center gap-space-xs text-primary-fixed font-semibold tracking-wider uppercase">
              <span className="inline-block w-2 h-2 rounded-full bg-primary-fixed animate-pulse"></span>
              <span>DEVNET PROTOCOL</span>
            </div>
            <span className="text-outline hidden sm:inline">|</span>
            <div className="text-on-surface-variant flex items-center gap-1.5">
              <span className="text-outline">NETWORK:</span>
              <span className="text-on-surface">GenLayer Studio Next</span>
              <span className="px-1.5 py-0.5 bg-surface-container text-[10px] font-mono-label-xs text-primary-fixed">CHAIN ID 61997</span>
            </div>
            <span className="text-outline hidden sm:inline">|</span>
            <div className="text-on-surface-variant flex items-center gap-1.5">
              <span className="text-outline">ORACLE REGISTRIES:</span>
              <span className="text-on-surface">PyPI + npm Official Wire</span>
            </div>
          </div>
          <div className="flex items-center gap-space-md">
            <div className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">
              <span>CONTRACT: </span>
              <span className="text-secondary font-mono">{contractDisplay}</span>
            </div>
          </div>
        </div>
      </section>

      {/* INDUSTRIAL CAD HERO CHAMBER */}
      <section className="w-full bg-surface px-margin-sm md:px-margin py-space-xl relative overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
          {/* LEFT INDUSTRIAL HUD ANCHOR */}
          <div className="lg:col-span-3 bg-primary-container text-on-primary-container p-space-lg flex flex-col justify-between shadow-xl relative overflow-hidden min-h-[360px]">
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs uppercase tracking-widest font-black text-on-primary-fixed">CAD METRICS DOCK</span>
                <span className="font-mono-label-xs text-mono-label-xs font-mono bg-on-primary-container text-primary-container px-1.5 py-0.5">DEVNET</span>
              </div>
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-on-primary-fixed leading-none mt-space-md">GEN 61997</span>
              <p className="font-body-md text-body-md text-on-primary-fixed-variant font-medium mt-space-xs">
                Time-gated, deterministic release escrow for open source packages.
              </p>
            </div>
            <div className="flex flex-col gap-space-md my-space-lg">
              <div className="flex flex-col gap-1">
                <span className="font-mono-data-sm text-mono-data-sm uppercase tracking-wider text-on-primary-fixed/70">ORACLE CONSENSUS</span>
                <span className="font-mono-metric-md text-mono-metric-md font-bold text-on-primary-fixed leading-none">GENLAYER BFT</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono-data-sm text-mono-data-sm uppercase tracking-wider text-on-primary-fixed/70">PROTOCOL FEE</span>
                <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-on-primary-fixed leading-none">0.00%</span>
              </div>
              <div className="pt-space-sm">
                <div className="bg-surface-container-lowest text-primary px-space-md py-space-sm flex items-center justify-between shadow-md">
                  <span className="font-mono-label-xs text-mono-label-xs tracking-wider uppercase text-primary-fixed">DEPLOYED: {contractDisplay}</span>
                  <span className="material-symbols-outlined text-[16px] text-primary-fixed">verified</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT HERO CORE */}
          <div className="lg:col-span-9 bg-surface-container-lowest p-space-lg md:p-space-xl flex flex-col justify-between relative shadow-2xl">
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
                  <span>Enter App &amp; Lock Escrow</span>
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </Link>
                <Link className="bg-surface-container-low text-on-surface font-body-md text-body-md px-space-lg py-3 uppercase tracking-wider hover:bg-surface-bright transition-colors flex items-center gap-space-sm" href="/how">
                  <span className="material-symbols-outlined text-[18px]">terminal</span>
                  <span>How ShipLock Works</span>
                </Link>
              </div>
            </div>

            {/* ISOMETRIC CAD VERIFICATION WIREFRAME SCHEMATIC (SVG) */}
            <div className="w-full mt-space-xl pt-space-md relative bg-surface-container-low/50 p-space-md shadow-inner">
              <div className="flex items-center justify-between pb-space-sm font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-primary-fixed rounded-full"></span>TELEMETRY SCHEMATIC: GENLAYER LEADERLESS ORACLE CHOREOGRAPHY</span>
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
                  <text fill="#ffb4ab" fontFamily="JetBrains Mono" fontSize="10" x="14" y="82">Post-Window Miss: 100% -&gt; Funder</text>
                </g>
              </svg>
              <div className="grid grid-cols-3 gap-space-sm pt-space-xs text-on-surface-variant font-mono-data-sm text-mono-data-sm">
                <div>01 // FUNDER DEPOSIT ESCROW</div>
                <div className="text-center">02 // MULTI-NODE REGISTRY QUORUM</div>
                <div className="text-right">03 // DETERMINISTIC SETTLEMENT</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROTOCOL BENCHMARK BAR - CLEARLY LABELED AS ILLUSTRATIVE TESTNET TARGETS */}
      <div className="w-full bg-surface-container-high px-margin-sm md:px-margin py-space-sm grid grid-cols-2 md:grid-cols-4 gap-space-md z-10 relative">
        <div className="flex flex-col">
          <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">SUPPORTED ECOSYSTEMS</span>
          <span className="font-mono-metric-md text-mono-metric-md text-primary">PyPI + NPM</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">COLLATERAL ASSET</span>
          <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed">TEST GEN</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">ORACLE DISPATCH</span>
          <span className="font-mono-metric-md text-mono-metric-md text-primary">LEADERLESS HTTP</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">TARGET CHAIN ID</span>
          <span className="font-mono-metric-md text-mono-metric-md text-on-surface">61997</span>
        </div>
      </div>

      {/* ILLUSTRATIVE ESCROW FIXTURES STRIP - CLEARLY DISTINGUISHED FROM LIVE DATA */}
      <section className="w-full bg-surface-container-low py-space-xl px-margin-sm md:px-margin z-10 relative">
        <div className="w-full flex flex-col gap-space-md mb-space-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="w-3 h-3 bg-primary-fixed"></span>
              <h2 className="font-headline-sm text-headline-sm uppercase tracking-tight text-primary">
                Illustrative Escrow Lifecycle Scenarios
              </h2>
            </div>
            <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              [EXAMPLE DEMONSTRATIONS // NOT LIVE CHAIN METRICS]
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Inspect the three core terminal lifecycle patterns supported by the ShipLock smart contract.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-center">
          {/* FLANK LEFT: RESOLVED SUCCESS LOCK */}
          <div className="lg:col-span-4 bg-surface-container p-space-md shadow-md flex flex-col justify-between min-h-[300px]">
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs bg-surface-container-highest text-secondary px-space-xs py-0.5 uppercase">EXAMPLE: RELEASED</span>
                <span className="font-mono-label-xs text-mono-label-xs text-outline">DEMO #1</span>
              </div>
              <div className="pt-space-xs flex flex-col">
                <span className="font-headline-sm text-headline-sm text-primary">pydantic-xml-rpc</span>
                <span className="font-mono-data-sm text-mono-data-sm text-primary-fixed">v1.2.0 (PyPI Verified)</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant pt-space-xs">
                Published within window, not yanked. Quorum confirmed registry ingest. 100% principal settled to maintainer wallet.
              </p>
            </div>
            <div className="pt-space-md flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm">
              <div className="flex justify-between font-mono-data-sm text-mono-data-sm">
                <span className="text-on-surface-variant">Escrow Principal:</span>
                <span className="text-primary font-medium">1,250.00 GEN</span>
              </div>
              <div className="flex justify-between font-mono-data-sm text-mono-data-sm">
                <span className="text-on-surface-variant">Outcome:</span>
                <span className="text-primary-fixed">100% Paid to Recipient</span>
              </div>
            </div>
          </div>

          {/* CENTER RAISED: RIPE OPEN LOCK */}
          <div className="lg:col-span-4 bg-surface-container-highest p-space-lg shadow-2xl -mt-2 lg:-mt-4 relative flex flex-col justify-between min-h-[360px]">
            <div className="absolute top-0 right-0 bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs font-bold px-space-sm py-1 uppercase">
              ACTIVE WINDOW
            </div>
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-primary-fixed animate-ping"></span>
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed font-bold uppercase">EXAMPLE: OPEN &amp; RETRYABLE</span>
              </div>
              <div className="pt-space-xs flex flex-col">
                <span className="font-headline-md text-headline-md text-primary">fastapi-auth-guards</span>
                <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed">target: v0.4.2</span>
              </div>
              <div className="bg-surface-container-low p-space-sm flex flex-col gap-1 font-mono-data-sm text-mono-data-sm text-on-surface">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Registry:</span>
                  <span className="text-on-surface">PyPI Registry</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Escrow Principal:</span>
                  <span className="text-primary-fixed font-semibold">2,500.00 GEN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Early 404 Status:</span>
                  <span className="text-secondary font-semibold">OPEN (Retryable)</span>
                </div>
              </div>
            </div>
            <div className="pt-space-md flex flex-col gap-space-sm">
              <Link 
                href="/browse" 
                className="w-full py-space-sm bg-primary-container text-on-primary-container font-mono-label-xs text-mono-label-xs font-bold tracking-wider uppercase flex items-center justify-center gap-space-xs hover:bg-primary transition-colors text-center"
              >
                <span className="material-symbols-outlined text-[16px]">search</span>
                <span>EXPLORE ACTIVE LOCKS IN BROWSE</span>
              </Link>
              <span className="text-center font-mono-label-xs text-mono-label-xs text-on-surface-variant uppercase">
                Early 404 leaves escrow open without fund transfers
              </span>
            </div>
          </div>

          {/* FLANK RIGHT: REFUNDED MISSING VERSION */}
          <div className="lg:col-span-4 bg-surface-container p-space-md shadow-md flex flex-col justify-between min-h-[300px]">
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs bg-error-container text-on-error-container px-space-xs py-0.5 uppercase">EXAMPLE: REFUND_NOHIT</span>
                <span className="font-mono-label-xs text-mono-label-xs text-outline">DEMO #3</span>
              </div>
              <div className="pt-space-xs flex flex-col">
                <span className="font-headline-sm text-headline-sm text-primary">@core/router-flux</span>
                <span className="font-mono-data-sm text-mono-data-sm text-error">v3.0.0 (npm Not Published)</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant pt-space-xs">
                Window ended without valid publication on npm registry. Oracle consensus confirmed missing release at/after window_end. 100% refunded to funder.
              </p>
            </div>
            <div className="pt-space-md flex flex-col gap-space-xs bg-surface-container-lowest p-space-sm">
              <div className="flex justify-between font-mono-data-sm text-mono-data-sm">
                <span className="text-on-surface-variant">Escrow Principal:</span>
                <span className="text-primary font-medium">850.00 GEN</span>
              </div>
              <div className="flex justify-between font-mono-data-sm text-mono-data-sm">
                <span className="text-on-surface-variant">Outcome:</span>
                <span className="text-error">100% Refunded Post-Window</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EDITORIAL SPLIT VALUE PROPOSITIONS */}
      <section className="w-full bg-surface py-space-xl px-margin-sm md:px-margin z-10 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-lg items-end">
          <div className="lg:col-span-8 flex flex-col gap-space-xs">
            <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-widest font-bold">[ENGINE SPECIFICATION]</span>
            <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight font-normal">
              Zero-Trust Software Bounty Settlement
            </h2>
          </div>
          <div className="lg:col-span-4 flex justify-start lg:justify-end">
            <Link href="/browse" className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-wider hover:underline flex items-center gap-1">
              <span>EXPLORE ESCROW REGISTRY</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
          <div className="bg-surface-container p-space-lg flex flex-col justify-between">
            <div className="flex flex-col gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">01 // NO MIDDLEMEN</span>
              <h3 className="font-headline-sm text-headline-sm text-primary">Decentralized Web Ingest</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                GenLayer validators run intelligent contract code capable of deterministic HTTPS queries directly against PyPI and npm registries.
              </p>
            </div>
          </div>
          <div className="bg-surface-container p-space-lg flex flex-col justify-between">
            <div className="flex flex-col gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">02 // DETERMINISTIC</span>
              <h3 className="font-headline-sm text-headline-sm text-primary">Zero Slippage or Cuts</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                100% of the collateral routes to the maintainer on verified release, or 100% refunds to the funder upon deadline expiry.
              </p>
            </div>
          </div>
          <div className="bg-surface-container p-space-lg flex flex-col justify-between">
            <div className="flex flex-col gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase">03 // NON-CUSTODIAL</span>
              <h3 className="font-headline-sm text-headline-sm text-primary">Timelocked Release Windows</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Funders cannot cancel once the execution window begins. Maintainers have guaranteed escrow security to ship with confidence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER CALLOUT ACTION */}
      <section className="w-full bg-surface-container px-margin-sm md:px-margin py-space-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-center">
          <div className="lg:col-span-8 flex flex-col gap-space-sm">
            <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight font-normal">
              Ready to fund or release a package bounty?
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
              Lock test GEN tokens against public semver targets on GenLayer Studio Next.
            </p>
            <div className="flex items-center gap-space-md pt-space-sm">
              <Link href="/lock" className="bg-primary-container text-on-primary-container font-body-md text-body-md px-space-xl py-3 font-semibold uppercase tracking-wider hover:bg-primary transition-colors">
                Lock New Escrow
              </Link>
              <Link href="/browse" className="bg-surface-container-high text-on-surface font-body-md text-body-md px-space-lg py-3 uppercase tracking-wider hover:bg-surface-bright transition-colors">
                Browse Escrows
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
