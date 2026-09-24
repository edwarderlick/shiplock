"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function HowItWorks() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const toggleFaq = (id: string) => {
    setOpenFaq(openFaq === id ? null : id);
  };

  const faqs = [
    {
      id: "faq-1",
      num: "01",
      question: "How do GenLayer validators query PyPI and npm?",
      answer: "GenLayer smart contracts run inside an intelligent VM capable of executing leaderless off-chain web requests. When the release trigger is invoked, multiple validators independently fetch the canonical registry JSON (e.g. https://pypi.org/pypi/{pkg}/json or https://registry.npmjs.org/{pkg}), compare hashes of the version metadata block, and achieve BFT consensus before executing on-chain transfers."
    },
    {
      id: "faq-2",
      num: "02",
      question: "What happens if npm or PyPI has an outage during release?",
      answer: "If the registry returns non-200 HTTP codes, times out, or delivers corrupted data, the smart contract marks the query attempt as INSUFFICIENT. Because ShipLock mandates zero trapped funds, the full escrow deposit is immediately returned to the funder’s wallet."
    },
    {
      id: "faq-3",
      num: "03",
      question: "Can the funder cancel the escrow early?",
      answer: "Yes, but strictly before the designated UTC window begins. Once the start timestamp of the window is reached, the cancellation function is permanently locked out to prevent funders from reneging after work has shipped."
    },
    {
      id: "faq-4",
      num: "04",
      question: "Why test GEN instead of mainnet ETH or USDC?",
      answer: "ShipLock is presently deployed on GenLayer Studio Next (Chain ID 61997), a cutting-edge decentralized environment supporting AI and native web-oracle capabilities. All escrow operations utilize faucet test GEN for risk-free testing and verification workflow experimentation."
    }
  ];

  return (
    <div className="flex flex-col w-full text-on-surface">
      {/* TOP CAD HERO ANCHOR */}
      <section className="w-full grid grid-cols-1 lg:grid-cols-12 bg-surface">
        <div className="lg:col-span-4 bg-primary-container text-on-primary-container p-space-lg lg:p-space-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs uppercase tracking-widest text-on-primary-fixed">
              <span>PROTOCOL // CAD_01</span>
              <span>DEV_61997</span>
            </div>
            <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-on-primary-fixed leading-none mt-space-md">01 // ESCRW</span>
            <p className="font-body-md text-body-md text-on-primary-fixed font-medium mt-space-xs">
              Programmatic software delivery settlement. Zero human arbiters. Zero trust assumptions.
            </p>
          </div>
          <div className="flex flex-col gap-space-md my-space-xl">
            <div className="bg-primary-fixed-dim/30 p-space-md">
              <div className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary-fixed">SETTLEMENT LATENCY</div>
              <div className="font-mono-metric-md text-mono-metric-md font-bold text-on-primary-fixed">&lt; 1.2s SUB-BLOCK</div>
            </div>
            <div className="bg-primary-fixed-dim/30 p-space-md">
              <div className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary-fixed">ORACLE MECHANISM</div>
              <div className="font-mono-metric-md text-mono-metric-md font-bold text-on-primary-fixed">5/5 CONSENSUS JSON</div>
            </div>
            <div className="bg-primary-fixed-dim/30 p-space-md">
              <div className="font-mono-label-xs text-mono-label-xs uppercase text-on-primary-fixed">VERIFIED REGISTRIES</div>
              <div className="font-mono-metric-md text-mono-metric-md font-bold text-on-primary-fixed">PYPI + NPM OFFICIAL</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-space-md font-mono-data-sm text-mono-data-sm text-on-primary-fixed">
            <span className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[16px]">terminal</span>
              GENLAYER_STUDIO_NEXT
            </span>
            <span>ID: 61997</span>
          </div>
        </div>

        <div className="lg:col-span-8 bg-surface-container-lowest p-space-lg lg:p-space-xl flex flex-col justify-between relative">
          <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline uppercase pb-space-md">
            <span>ARCHITECTURAL SPECIFICATION</span>
            <span>[SPEC: SHIPLOCK_V2.4]</span>
          </div>
          <div className="max-w-3xl my-space-md">
            <h1 className="font-display-lg text-display-lg text-primary tracking-tight font-normal">
              Pay when the version actually ships and is not yanked.
            </h1>
            <p className="font-body-lg text-body-lg text-secondary mt-space-md leading-relaxed max-w-2xl">
              ShipLock is time-gated release escrow settled directly from official registry JSON on GenLayer Studio Next (Chain 61997). Funds unlock strictly upon autonomous cryptographic verification of public software artifacts.
            </p>
          </div>

          <div className="bg-surface-container-low p-space-md my-space-lg">
            <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline uppercase mb-space-sm">
              <span>PIPELINE SCHEMATIC: PYPI / NPM WIRE VERIFIER</span>
              <span className="text-primary-fixed">AUTONOMOUS ORACLE STATE</span>
            </div>
            <div className="w-full h-44 relative overflow-hidden flex items-center justify-center bg-surface-container-lowest">
              <svg className="w-full h-full text-outline/30" fill="none" viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern height="24" id="cadGrid" patternUnits="userSpaceOnUse" width="24">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeDasharray="2 2" strokeWidth="0.5"></path>
                  </pattern>
                </defs>
                <rect fill="url(#cadGrid)" height="100%" width="100%"></rect>
                <path d="M 60 140 L 220 70 L 400 120 L 580 50 L 740 100" stroke="#d8ee48" strokeDasharray="4 4" strokeWidth="1.5"></path>
                <circle cx="60" cy="140" fill="#d8ee48" r="5"></circle>
                <circle cx="220" cy="70" fill="#d8ee48" r="5"></circle>
                <circle cx="400" cy="120" fill="#d8ee48" r="5"></circle>
                <circle cx="580" cy="50" fill="#d8ee48" r="5"></circle>
                <circle cx="740" cy="100" fill="#30D158" r="5"></circle>
                <g transform="translate(190, 45)">
                  <polygon fill="#201f1f" points="30,0 60,15 30,30 0,15" stroke="#d8ee48" strokeWidth="1"></polygon>
                  <text fill="#e5e2e1" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle" x="30" y="44">STATION 01</text>
                </g>
                <g transform="translate(370, 95)">
                  <polygon fill="#201f1f" points="30,0 60,15 30,30 0,15" stroke="#d8ee48" strokeWidth="1"></polygon>
                  <text fill="#e5e2e1" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle" x="30" y="44">ESCROW LOCKED</text>
                </g>
                <g transform="translate(550, 25)">
                  <polygon fill="#201f1f" points="30,0 60,15 30,30 0,15" stroke="#d8ee48" strokeWidth="1"></polygon>
                  <text fill="#e5e2e1" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle" x="30" y="44">ORACLE SYNC</text>
                </g>
                <g transform="translate(710, 75)">
                  <polygon fill="#201f1f" points="30,0 60,15 30,30 0,15" stroke="#30D158" strokeWidth="1.5"></polygon>
                  <text fill="#30D158" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle" x="30" y="44">SETTLED</text>
                </g>
              </svg>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-md">
            <div className="flex items-center gap-space-md">
              <a className="bg-primary-container text-on-primary-container font-headline-sm text-[15px] px-space-lg py-space-sm uppercase tracking-wide flex items-center gap-space-sm transition-all hover:bg-primary hover:text-on-primary" href="#workflow">
                <span>Explore Verification Workflow</span>
                <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
              </a>
              <a className="bg-surface-container-high text-on-surface font-mono-data-sm text-mono-data-sm px-space-md py-space-sm uppercase tracking-wider transition-colors hover:bg-surface-bright" href="#rules">
                View Protocol Rules
              </a>
            </div>
            <div className="font-mono-data-sm text-mono-data-sm text-on-surface-variant flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[16px] text-primary-fixed">verified</span>
              <span>100% PROGRAMMATIC EXECUTION</span>
            </div>
          </div>
        </div>
      </section>

      {/* EDITORIAL STATEMENT */}
      <section className="w-full bg-surface-container-high px-margin-sm md:px-margin py-space-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-center">
          <div className="lg:col-span-7 flex flex-col gap-space-sm">
            <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-widest">[SYSTEM MANDATE]</span>
            <h2 className="font-headline-lg text-headline-lg text-primary leading-tight">
              Eliminating milestones renegotiation, manual invoices, and vaporware bounties.
            </h2>
          </div>
          <div className="lg:col-span-5 flex flex-col justify-between gap-space-md bg-surface-container-lowest p-space-lg">
            <p className="font-body-md text-body-md text-secondary leading-relaxed">
              In typical contract arrangements, fund release requires manual sign-off or third-party arbiters with misaligned incentives. ShipLock locks test GEN inside GenLayer intelligent smart contracts that independently parse HTTP endpoints, validating package availability without human intermediation.
            </p>
            <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline pt-space-xs">
              <span>CONSENSUS: LEADERLESS MULTI-VALIDATOR</span>
              <span className="text-primary-fixed">CHAIN ID: 61997</span>
            </div>
          </div>
        </div>
      </section>

      {/* SEQUENTIAL WORKFLOW */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl flex flex-col gap-space-lg bg-surface" id="workflow">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div>
            <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-widest">[STEP-BY-STEP EXECUTION]</span>
            <h2 className="font-headline-lg text-headline-lg text-primary mt-space-xs">Sequential Workflow Architecture</h2>
          </div>
          <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant max-w-md">
            Deterministic five-stage cycle executing autonomously from contract deployment through oracle query to token transfer.
          </p>
        </div>

        <div className="flex flex-col gap-space-md">
          {/* Step 01 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">01</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">TARGET PAYLOAD</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">Registry & Artifact Specification</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed">IMMUTABLE PARAM</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                The funder selects an official decentralized package mirror (<strong className="text-primary">PyPI</strong> or <strong className="text-primary">npm</strong>) and enters the exact target package name and semver version string (e.g. <code className="font-mono-data-sm text-primary-fixed bg-surface-container px-1">v2.14.0</code>). Wildcards, ranges, and mutable pointer tags like <code className="font-mono-data-sm text-error bg-surface-container px-1">latest</code> are rejected at contract inception.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Target Source</span><span className="text-on-surface">pypi.org / registry.npmjs.org</span></div>
              <div className="flex justify-between py-1"><span>Version Scheme</span><span className="text-on-surface">SemVer strict</span></div>
              <div className="flex justify-between py-1"><span>Payload Type</span><span className="text-primary-fixed">JSON Schema v1</span></div>
            </div>
          </div>

          {/* Step 02 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">02</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">TEMPORAL WINDOW</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">Recipient Wallet & Future UTC Window Definition</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed">ANTI-FRONTRUN</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                Funder designates the recipient’s EVM wallet address and defines an authoritative future UTC window. Crucially, this release window must be configured to begin <strong className="text-primary">at least 24 hours into the future</strong>, neutralizing frontrunning and ensuring the artifact does not predate contract creation.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Lock Lead Time</span><span className="text-on-surface">≥ 24 Hours UTC</span></div>
              <div className="flex justify-between py-1"><span>Window Length</span><span className="text-on-surface">User-defined (1-30d)</span></div>
              <div className="flex justify-between py-1"><span>Recipient Check</span><span className="text-primary-fixed">Recipient ≠ Funder</span></div>
            </div>
          </div>

          {/* Step 03 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">03</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">COLLATERAL DEPOSIT</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">Smart Escrow Vault Lockup</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed">TEST GEN ASSET</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                The funder approves and deposits test GEN tokens into the immutable GenLayer smart contract. The contract records the package descriptor hash, recipient signature, and timestamp parameters into on-chain state, fully locking funds in isolation.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Vault State</span><span className="text-primary-fixed font-semibold">OPEN / LOCKED</span></div>
              <div className="flex justify-between py-1"><span>Custodian</span><span className="text-on-surface">Contract 0x90A...</span></div>
              <div className="flex justify-between py-1"><span>Cancellation</span><span className="text-on-surface">Valid before window</span></div>
            </div>
          </div>

          {/* Step 04 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">04</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">TRIGGER DISPATCH</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">Permissionless Release Trigger</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed">ANYONE EXCEPT FUNDER</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                Once the designated UTC window opens, <strong className="text-primary">any actor on the network</strong>—including the recipient, an automated bot, or an independent observer—can dispatch the settlement call. To eliminate collusion and hostage dynamics, the funder is strictly prohibited from executing their own release trigger.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Caller Access</span><span className="text-primary-fixed">Public / Open</span></div>
              <div className="flex justify-between py-1"><span>Funder Restriction</span><span className="text-error font-medium">FORBIDDEN</span></div>
              <div className="flex justify-between py-1"><span>Gas Compensation</span><span className="text-on-surface">EVM Sub-cent test GEN</span></div>
            </div>
          </div>

          {/* Step 05 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">05</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">CONSENSUS ORACLE</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">JSON Payload Parse & Instant Settlement</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-primary-container text-on-primary-container font-semibold">TERMINAL EXECUTION</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                GenLayer validators execute HTTP consensus directly against the canonical package endpoint JSON constructed by the smart contract. The contract checks publish timestamps and yank flags. If authentic and untampered, 100% of the locked GEN transfers to the recipient in the same block.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Oracle Endpoint</span><span className="text-on-surface">Constructed by Code</span></div>
              <div className="flex justify-between py-1"><span>Yank Detection</span><span className="text-on-surface">Active Boolean Check</span></div>
              <div className="flex justify-between py-1"><span>Transfer Speed</span><span className="text-primary-fixed">Atomic In-Block</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* MATRIX DISCRIMINATOR */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface-container-lowest">
        <div className="flex flex-col gap-space-xs mb-space-lg">
          <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline">
            <span>STATE DISCRIMINATOR // MATRIX V2</span>
            <span>DETERMINISTIC ESCROW RESULTS</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-primary">Deterministic Outcomes & Escrow States</h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Every escrow scenario has exactly one mathematical outcome. ShipLock ensures funds are never trapped, even in feed disruptions or failure scenarios.
          </p>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left font-mono-data-sm text-mono-data-sm">
            <thead className="bg-surface-container uppercase text-outline font-mono-label-xs text-mono-label-xs">
              <tr>
                <th className="p-space-md">State Chip</th>
                <th className="p-space-md">Registry / Trigger Condition</th>
                <th className="p-space-md">Financial Settlement</th>
                <th className="p-space-md">Safety Guarantee</th>
              </tr>
            </thead>
            <tbody className="divide-none bg-surface-container-low">
              <tr className="transition-colors hover:bg-surface-container">
                <td className="p-space-md">
                  <span className="font-mono-label-xs text-mono-label-xs px-space-sm py-1 bg-[rgba(48,209,88,0.1)] text-[#30D158] font-semibold">RELEASED</span>
                </td>
                <td className="p-space-md text-on-surface">Exact version published in-window, not marked yanked or deleted.</td>
                <td className="p-space-md"><span className="text-primary-fixed font-bold">100% GEN → Recipient Wallet</span></td>
                <td className="p-space-md text-on-surface-variant">Delivery confirmed against official JSON payload.</td>
              </tr>
              <tr className="transition-colors hover:bg-surface-container">
                <td className="p-space-md">
                  <span className="font-mono-label-xs text-mono-label-xs px-space-sm py-1 bg-[rgba(255,69,58,0.1)] text-[#FF453A] font-semibold">REFUND_NOHIT</span>
                </td>
                <td className="p-space-md text-on-surface">Version missing from registry, yanked by author, or timestamp outside window.</td>
                <td className="p-space-md"><span className="text-[#FF453A] font-bold">100% GEN → Funder Refund</span></td>
                <td className="p-space-md text-on-surface-variant">Zero loss for funders when delivery criteria fail.</td>
              </tr>
              <tr className="transition-colors hover:bg-surface-container">
                <td className="p-space-md">
                  <span className="font-mono-label-xs text-mono-label-xs px-space-sm py-1 bg-[rgba(255,159,10,0.1)] text-[#FF9F0A] font-semibold">INSUFFICIENT</span>
                </td>
                <td className="p-space-md text-on-surface">External registry offline, payload size exceeds limits, or parse error.</td>
                <td className="p-space-md"><span className="text-[#FF9F0A] font-bold">100% GEN → Funder Refund</span></td>
                <td className="p-space-md text-on-surface-variant">Fail-safe policy: Unreadable feeds never lock funds.</td>
              </tr>
              <tr className="transition-colors hover:bg-surface-container">
                <td className="p-space-md">
                  <span className="font-mono-label-xs text-mono-label-xs px-space-sm py-1 bg-surface-container-highest text-secondary-fixed font-semibold">CANCELED</span>
                </td>
                <td className="p-space-md text-on-surface">Triggered explicitly by funder before the future window starts.</td>
                <td className="p-space-md"><span className="text-secondary-fixed font-bold">100% GEN → Funder Refund</span></td>
                <td className="p-space-md text-on-surface-variant">Allows tactical reallocation before commitment begins.</td>
              </tr>
              <tr className="transition-colors hover:bg-surface-container">
                <td className="p-space-md">
                  <span className="font-mono-label-xs text-mono-label-xs px-space-sm py-1 bg-surface-container-highest text-secondary font-semibold">EXPIRED</span>
                </td>
                <td className="p-space-md text-on-surface">7-day post-window grace period elapses without release trigger.</td>
                <td className="p-space-md"><span className="text-secondary font-bold">100% GEN → Funder Refund</span></td>
                <td className="p-space-md text-on-surface-variant">Permanent cleanup: Prevents abandoned escrow states.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* PROTOCOL RULES */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface" id="rules">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-4 flex flex-col justify-between bg-surface-container-high p-space-lg">
            <div className="flex flex-col gap-space-sm">
              <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-widest">[CONSTRAINTS // POLICY]</span>
              <h3 className="font-headline-md text-headline-md text-primary leading-snug">The Strict Guardrails of ShipLock</h3>
              <p className="font-body-md text-body-md text-secondary mt-space-xs">
                ShipLock enforces programmatic safety through non-negotiable contract invariants. Any transaction attempting to violate these conditions will revert instantly on GenLayer Studio Next.
              </p>
            </div>
            <div className="bg-surface-container-lowest p-space-md mt-space-lg">
              <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs text-primary-fixed">
                <span className="material-symbols-outlined text-[16px]">gavel</span>
                <span>CONTRACT CONFORMANCE</span>
              </div>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-1">
                Rules apply globally without admin exceptions. No multisig override exists.
              </p>
            </div>
          </div>
          
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <div className="bg-surface-container-low p-space-lg flex flex-col justify-between">
              <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline mb-space-sm">
                <span>RULE #01</span>
                <span className="text-error font-medium">FORBIDDEN</span>
              </div>
              <h4 className="font-headline-sm text-headline-sm text-primary mb-space-xs">No Funding Inside Window</h4>
              <p className="font-body-md text-body-md text-on-surface-variant">
                You cannot fund an escrow with a window opening in less than 24 hours. This minimum 24-hour advance requirement prevents instant claims on already-staged package builds.
              </p>
            </div>

            <div className="bg-surface-container-low p-space-lg flex flex-col justify-between">
              <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline mb-space-sm">
                <span>RULE #02</span>
                <span className="text-error font-medium">STRICT REJECT</span>
              </div>
              <h4 className="font-headline-sm text-headline-sm text-primary mb-space-xs">No Pre-Existing or Yanked Versions</h4>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Attempting to create an escrow lock for a version number that is already published or marked as yanked in the registry metadata will fail validation during creation.
              </p>
            </div>

            <div className="bg-surface-container-low p-space-lg flex flex-col justify-between">
              <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline mb-space-sm">
                <span>RULE #03</span>
                <span className="text-error font-medium">ANTI-MANIPULATION</span>
              </div>
              <h4 className="font-headline-sm text-headline-sm text-primary mb-space-xs">Funder Cannot Trigger Release</h4>
              <p className="font-body-md text-body-md text-on-surface-variant">
                The funder wallet address is strictly barred from calling the release settlement method. This ensures funders cannot artificially orchestrate release timing or bypass normal oracle flow.
              </p>
            </div>

            <div className="bg-surface-container-low p-space-lg flex flex-col justify-between">
              <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline mb-space-sm">
                <span>RULE #04</span>
                <span className="text-error font-medium">IDENTITY SEPARATION</span>
              </div>
              <h4 className="font-headline-sm text-headline-sm text-primary mb-space-xs">Recipient Cannot Be Funder</h4>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Self-escrow is rejected on-chain (<code className="font-mono-data-sm text-outline">funder != recipient</code>). An escrow must exist between two distinct cryptographic accounts to represent a genuine delivery obligation.
              </p>
            </div>

            <div className="md:col-span-2 bg-surface-container-low p-space-lg flex flex-col justify-between">
              <div className="flex items-center justify-between font-mono-label-xs text-mono-label-xs text-outline mb-space-sm">
                <span>RULE #05</span>
                <span className="text-primary-fixed font-medium">SEMVER ENFORCEMENT</span>
              </div>
              <h4 className="font-headline-sm text-headline-sm text-primary mb-space-xs">Vague Names & Mutable Tags Strictly Rejected</h4>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Package versions like <code className="font-mono-data-sm text-primary-fixed">latest</code>, <code className="font-mono-data-sm text-primary-fixed">next</code>, <code className="font-mono-data-sm text-primary-fixed">^1.0.0</code>, or <code className="font-mono-data-sm text-primary-fixed">1.x</code> are illegal inputs. Only deterministic strings matching standard SemVer specifications (e.g., <code className="font-mono-data-sm text-primary-fixed">1.4.2</code>, <code className="font-mono-data-sm text-primary-fixed">2.0.0-rc.1</code>) are parsed by validators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ / ACCORDION */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface-container-lowest">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-5 bg-primary-container text-on-primary-container p-space-lg lg:p-space-xl flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 bg-surface-container-lowest text-primary-fixed flex items-center justify-center mb-space-md">
                <span className="material-symbols-outlined text-[20px]">help_outline</span>
              </div>
              <h3 className="font-display-lg text-[36px] leading-[40px] text-on-primary-fixed">
                Have questions about automated delivery escrow?
              </h3>
              <p className="font-body-md text-body-md text-on-primary-fixed mt-space-md leading-relaxed">
                Review our architectural telemetry details or join the GenLayer Studio discord to query live contract testnets.
              </p>
            </div>
            <div className="pt-space-xl flex flex-col gap-space-sm">
              <Link href="/lock" className="bg-surface-container-lowest text-primary font-headline-sm text-[14px] px-space-md py-space-sm uppercase tracking-wider flex items-center justify-between transition-colors hover:bg-surface-bright">
                <span>Launch Escrow Wizard</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
              <span className="font-mono-label-xs text-mono-label-xs text-on-primary-fixed uppercase tracking-wider">
                CONTRACT CAD SUITE // V2.4.0
              </span>
            </div>
          </div>
          
          <div className="lg:col-span-7 flex flex-col gap-space-sm">
            {faqs.map((faq) => (
              <div 
                key={faq.id}
                className="bg-surface-container-low p-space-md cursor-pointer transition-colors hover:bg-surface-container" 
                onClick={() => toggleFaq(faq.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed">{faq.num}</span>
                    <span className="font-headline-sm text-headline-sm text-primary">{faq.question}</span>
                  </div>
                  <span className={`material-symbols-outlined text-outline transition-transform ${openFaq === faq.id ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </div>
                {openFaq === faq.id && (
                  <div className="pt-space-sm text-secondary font-body-md text-body-md">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
