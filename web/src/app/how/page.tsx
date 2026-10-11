"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CONTRACT_ADDRESS } from "@/lib/env";

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
      answer: "GenLayer smart contracts run inside an intelligent VM capable of executing leaderless off-chain web requests. When the release trigger is invoked, multiple validators independently fetch the canonical registry JSON (e.g. https://pypi.org/pypi/{pkg}/{ver}/json or https://registry.npmjs.org/{pkg}), compare hashes of the version metadata block, and achieve BFT consensus before executing on-chain transfers."
    },
    {
      id: "faq-2",
      num: "02",
      question: "What happens if npm or PyPI has an outage or 404 before window end?",
      answer: "If a registry check encounters an early 404, temporary outage, rate limit, or inconclusive response before the publication window ends (now < window_end_utc), the smart contract keeps the escrow OPEN with zero fund transfers and records a retryable status. The author retains the full remaining window to publish. A final no-hit refund is permitted only at or after window_end_utc when a verified 404, yanked release, or out-of-window timestamp confirms the version did not ship."
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

  const contractDisplay = CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}` : "0x...";

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
              <div className="font-mono-metric-md text-mono-metric-md font-bold text-on-primary-fixed">VALIDATOR CONSENSUS JSON</div>
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
                    <line stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" x1="0" x2="24" y1="0" y2="0"></line>
                    <line stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" x1="0" x2="0" y1="0" y2="24"></line>
                  </pattern>
                </defs>
                <rect fill="url(#cadGrid)" height="200" width="800"></rect>
                <path d="M 50 100 L 250 100" stroke="#d8ee48" strokeWidth="2"></path>
                <circle cx="50" cy="100" fill="#d8ee48" r="6"></circle>
                <rect fill="#201f1f" height="50" stroke="#d8ee48" strokeWidth="1" width="120" x="250" y="75"></rect>
                <text fill="#ffffff" fontFamily="Space Grotesk" fontSize="12" textAnchor="middle" x="310" y="105">ORACLE INGEST</text>
                <path d="M 370 100 L 550 100" stroke="#d8ee48" strokeDasharray="4 4" strokeWidth="2"></path>
                <circle cx="550" cy="100" fill="#d8ee48" r="6"></circle>
                <rect fill="#2a2a2a" height="60" stroke="#d8ee48" strokeWidth="1.5" width="160" x="590" y="70"></rect>
                <text fill="#d8ee48" fontFamily="Space Grotesk" fontSize="12" fontWeight="bold" textAnchor="middle" x="670" y="98">100% DISBURSE</text>
                <text fill="#c7c8af" fontFamily="JetBrains Mono" fontSize="10" textAnchor="middle" x="670" y="116">ZERO SLIPPAGE</text>
              </svg>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-md border-t border-outline/10 font-mono-data-sm text-mono-data-sm">
            <span className="text-secondary">INTELLIGENT CONTRACT VM</span>
            <div className="flex gap-space-md">
              <span className="text-primary-fixed">HTTP NATIVE</span>
              <span className="text-outline">/</span>
              <span className="text-primary-fixed">BFT MULTI-NODE</span>
            </div>
          </div>
        </div>
      </section>

      {/* SIX STEP SEQUENTIAL BLUEPRINT */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface-container-low" id="lifecycle">
        <div className="flex flex-col gap-space-md mb-space-xl">
          <div className="flex items-center gap-space-sm">
            <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed uppercase font-bold">LIFECYCLE</span>
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-widest">{"// THE SIX STEP CAD BLUEPRINT"}</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-primary">Deterministic Delivery Pipeline</h2>
          <p className="font-body-lg text-body-lg text-secondary max-w-2xl">
            Every escrow follows strict mathematical and temporal constraints, ensuring no fund loss or arbiter dispute.
          </p>
        </div>

        <div className="flex flex-col gap-space-md">
          {/* Step 01 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">01</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">PRE-CONDITION</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">Pre-Publication Ingestion &amp; 404 Validation</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed">LOOKBACK 404 OK</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                Before any funds can be locked, GenLayer oracle validators query the target registry (PyPI or npm). If the requested version is already published or yanked, escrow creation is immediately rejected.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Target Match</span><span className="text-on-surface">Exact Semver</span></div>
              <div className="flex justify-between py-1"><span>Requirement</span><span className="text-primary-fixed font-semibold">Verified 404</span></div>
              <div className="flex justify-between py-1"><span>Verification</span><span className="text-on-surface">Automated</span></div>
            </div>
          </div>

          {/* Step 02 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">02</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">TIMELOCK LEAD</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">Lead-Time Window Gating</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed">24H BUFFER</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                The evaluation window start date must be configured at least 24 hours into the future from contract creation. This prevents front-running and provides ample lead-time for maintainer notification.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Min Lead Time</span><span className="text-on-surface">24 Hours UTC</span></div>
              <div className="flex justify-between py-1"><span>Window Range</span><span className="text-on-surface">1 - 14 Days</span></div>
              <div className="flex justify-between py-1"><span>Grace Period</span><span className="text-primary-fixed font-semibold">7 Days Post-Close</span></div>
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
                The funder approves and deposits test GEN tokens into the GenLayer smart contract. The contract deterministically records the package coordinates, recipient address, and timestamp parameters into on-chain state.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Vault State</span><span className="text-primary-fixed font-semibold">OPEN / LOCKED</span></div>
              <div className="flex justify-between py-1"><span>Custodian</span><span className="text-on-surface font-mono">{contractDisplay}</span></div>
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
                Once the designated UTC window opens, <strong className="text-primary">any actor on the network</strong>—including the recipient, an automated bot, or an independent observer—can dispatch the settlement call. To prevent unilateral claim fraud, the funder is strictly prohibited from executing their own release trigger.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Eligibility</span><span className="text-on-surface">Permissionless</span></div>
              <div className="flex justify-between py-1"><span>Exclusion</span><span className="text-error font-semibold">Funder Denied</span></div>
              <div className="flex justify-between py-1"><span>Window Status</span><span className="text-primary-fixed font-semibold">Active Window</span></div>
            </div>
          </div>

          {/* Step 05 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">05</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">CONSENSUS AUDIT</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">Independent Multi-Validator Verification</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed">VALIDATOR CONSENSUS</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                Network validators independently issue HTTPS calls to the canonical registry endpoint, parse publish timestamps, check for yanking status, and execute strict consensus agreement.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Quorum Req</span><span className="text-primary-fixed font-semibold">Consensus Required</span></div>
              <div className="flex justify-between py-1"><span>Oracle Transport</span><span className="text-on-surface">Native HTTPS</span></div>
              <div className="flex justify-between py-1"><span>Payload Check</span><span className="text-on-surface">Time &amp; Yank Field</span></div>
            </div>
          </div>

          {/* Step 06 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest transition-colors hover:bg-surface-container-low">
            <div className="lg:col-span-2 bg-surface-container p-space-md lg:p-space-lg flex flex-col justify-between">
              <span className="font-mono-metric-lg text-mono-metric-lg font-bold text-primary-fixed">06</span>
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">SETTLEMENT</span>
            </div>
            <div className="lg:col-span-7 p-space-lg flex flex-col justify-center">
              <div className="flex items-center gap-space-sm mb-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">Binary Disintermediation Settlement</span>
                <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-primary-container text-on-primary-container font-bold">100% DISBURSE</span>
              </div>
              <p className="font-body-md text-body-md text-secondary leading-relaxed">
                Upon valid publication in-window, 100% of the collateral is automatically transferred to the recipient. If an early 404 or temporary registry issue occurs, the escrow stays OPEN and retryable. Once window_end arrives without delivery, 100% is refunded to the funder.
              </p>
            </div>
            <div className="lg:col-span-3 bg-surface-container-low p-space-md flex flex-col justify-center font-mono-data-sm text-mono-data-sm text-on-surface-variant">
              <div className="flex justify-between py-1"><span>Success State</span><span className="text-primary-fixed font-semibold">RELEASED (100% Pay)</span></div>
              <div className="flex justify-between py-1"><span>Early 404 / Outage</span><span className="text-secondary font-semibold">OPEN (Retryable)</span></div>
              <div className="flex justify-between py-1"><span>Post-Window No-Hit</span><span className="text-error font-semibold">REFUND_NOHIT (100%)</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* MATRIX TABLE OF TERMINAL OUTCOMES */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface-container">
        <div className="flex flex-col gap-space-md mb-space-lg">
          <div className="flex items-center gap-space-sm">
            <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-primary-container text-on-primary-container uppercase font-bold">LEDGER</span>
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-widest">{"// SETTLEMENT STATE MACHINE"}</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-primary">All Definitive Escrow States</h2>
        </div>

        <div className="w-full overflow-x-auto shadow-sm">
          <table className="w-full text-left font-mono-data-sm text-mono-data-sm border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-surface-container-high text-on-surface font-mono-label-xs text-mono-label-xs uppercase">
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
                <td className="p-space-md text-on-surface">Exact version published in-window, not marked yanked.</td>
                <td className="p-space-md"><span className="text-primary-fixed font-bold">100% GEN → Recipient Wallet</span></td>
                <td className="p-space-md text-on-surface-variant">Delivery confirmed against official JSON payload.</td>
              </tr>
              <tr className="transition-colors hover:bg-surface-container">
                <td className="p-space-md">
                  <span className="font-mono-label-xs text-mono-label-xs px-space-sm py-1 bg-secondary-container/20 text-secondary font-semibold">OPEN (Retryable)</span>
                </td>
                <td className="p-space-md text-on-surface">Early 404, registry timeout, rate limit, or transient failure before window_end.</td>
                <td className="p-space-md"><span className="text-secondary font-bold">No Transfer (Escrow Stays Open)</span></td>
                <td className="p-space-md text-on-surface-variant">Author retains full delivery window; retryable anytime.</td>
              </tr>
              <tr className="transition-colors hover:bg-surface-container">
                <td className="p-space-md">
                  <span className="font-mono-label-xs text-mono-label-xs px-space-sm py-1 bg-[rgba(255,69,58,0.1)] text-[#FF453A] font-semibold">REFUND_NOHIT</span>
                </td>
                <td className="p-space-md text-on-surface">At/after window_end: verified 404, yanked version, or timestamp outside window.</td>
                <td className="p-space-md"><span className="text-[#FF453A] font-bold">100% GEN → Funder Refund</span></td>
                <td className="p-space-md text-on-surface-variant">Zero loss for funders when delivery criteria fail after window close.</td>
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

      {/* FAQ SECTION */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface-container-low" id="faq">
        <div className="flex flex-col gap-space-md mb-space-lg">
          <div className="flex items-center gap-space-sm">
            <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed uppercase font-bold">FAQ</span>
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-widest">{"// PROTOCOL DISCLOSURES"}</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-primary">Frequently Asked Inquiries</h2>
        </div>

        <div className="flex flex-col gap-space-xs">
          {faqs.map(faq => (
            <div key={faq.id} className="bg-surface-container-lowest border border-outline/10">
              <button 
                onClick={() => toggleFaq(faq.id)}
                className="w-full p-space-md flex items-center justify-between text-left hover:bg-surface-container transition-colors"
              >
                <div className="flex items-center gap-space-md">
                  <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed">{faq.num}</span>
                  <span className="font-headline-sm text-headline-sm text-primary uppercase">{faq.question}</span>
                </div>
                <span className="material-symbols-outlined text-outline">
                  {openFaq === faq.id ? 'remove' : 'add'}
                </span>
              </button>
              {openFaq === faq.id && (
                <div className="p-space-md pt-0 text-secondary font-body-md text-body-md leading-relaxed border-t border-outline/5 mt-space-xs">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA FOOTER STRIP */}
      <section className="w-full bg-primary-container text-on-primary-container px-margin-sm md:px-margin py-space-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-1 max-w-xl">
          <span className="font-mono-label-xs text-mono-label-xs uppercase tracking-widest font-bold text-on-primary-fixed">READY FOR EXPERIMENTATION</span>
          <h2 className="font-headline-lg text-headline-lg uppercase font-bold text-on-primary-fixed">Deploy an Autonomous Lock Now</h2>
          <p className="font-body-md text-body-md text-on-primary-fixed-variant">
            Connect your browser signer on GenLayer Studio Next devnet and create a zero-custody escrow in seconds.
          </p>
        </div>
        <Link 
          href="/lock"
          className="px-space-xl py-space-md bg-on-primary-fixed text-primary-fixed font-headline-sm text-headline-sm uppercase font-bold tracking-wider hover:bg-surface-bright transition-colors shadow-lg shrink-0"
        >
          Initialize Escrow
        </Link>
      </section>
    </div>
  );
}
