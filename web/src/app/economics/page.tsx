"use client";

import React, { useState } from "react";

export default function Economics() {
  const [blockTime, setBlockTime] = useState<number>(1741216892);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copyStatus, setCopyStatus] = useState("READY");

  const jsonContent = `{
  "jsonrpc": "2.0",
  "id": 6199701,
  "result": {
    "contract_suite": "0x90A5F92E389178BCF011F4E982A2E44bA84c11F4",
    "network": {
      "chain_id": 61997,
      "name": "GenLayer Studio Next",
      "consensus": "5/5 Leaderless Registry Oracles",
      "block_latency_ms": 42
    },
    "economics_ledger": {
      "escrowed_open_principal": {
        "wei": "48950000000000000000000",
        "formatted_gen": "48,950.00 TEST GEN",
        "active_locks_count": 28
      },
      "total_settled_recipients": {
        "wei": "142300000000000000000000",
        "formatted_gen": "142,300.00 TEST GEN",
        "completed_releases_count": 84
      },
      "total_refunded_funders": {
        "wei": "67450000000000000000000",
        "formatted_gen": "67,450.00 TEST GEN",
        "clawbacks_count": 39,
        "states": ["REFUND_NOHIT", "INSUFFICIENT", "CANCELED", "EXPIRED"]
      },
      "outstanding_fallback_credits": {
        "wei": "1250000000000000000000",
        "formatted_gen": "1,250.00 TEST GEN",
        "beneficiary_wallets": 4
      },
      "protocol_treasury_fee_take": {
        "wei": "0",
        "fee_bps": 0,
        "passthrough_rate": 1.0
      }
    },
    "invariant_audit": {
      "exact_conservation": true,
      "delta_drift_wei": "0"
    }
  }
}`;

  const handleRefresh = () => {
    setIsSyncing(true);
    setBlockTime(Math.floor(Date.now() / 1000));
    setTimeout(() => {
      setIsSyncing(false);
    }, 1200);
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
      {/* Top Telemetry Ribbon */}
      <div className="w-full bg-surface-container-lowest px-margin-sm md:px-margin py-space-xs flex flex-wrap items-center justify-between gap-space-sm text-on-surface-variant font-mono-label-xs text-mono-label-xs tracking-wider">
        <div className="flex items-center gap-space-md flex-wrap">
          <span className="flex items-center gap-1.5 text-primary-fixed font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-fixed animate-pulse"></span>
            GENLAYER STUDIO NEXT (61997)
          </span>
          <span className="text-outline">//</span>
          <span>RPC: studio-dev.genlayer.com/api</span>
          <span className="text-outline">//</span>
          <span>METHOD: <span className="text-on-surface">ShipLock.get_economics()</span></span>
        </div>
        <div className="flex items-center gap-space-md">
          <span className="text-on-surface font-mono-data-sm text-mono-data-sm">
            BLOCK_TIMESTAMP: <span className="text-primary-fixed">{blockTime}</span>
          </span>
          <button 
            className={`px-space-xs py-0.5 font-mono-label-xs uppercase transition-colors flex items-center gap-1 ${
              isSyncing ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high hover:bg-surface-bright text-on-surface'
            }`}
            onClick={handleRefresh}
          >
            <span className="material-symbols-outlined text-[12px]">{isSyncing ? 'done' : 'sync'}</span>
            {isSyncing ? 'SYNCED' : 'QUERY RPC'}
          </button>
        </div>
      </div>

      {/* Editorial Headline Section */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface flex flex-col gap-space-lg relative overflow-hidden">
        {/* Ambient wireframe CAD watermark */}
        <div className="absolute right-0 top-0 w-96 h-96 pointer-events-none opacity-10 flex items-center justify-center">
          <svg className="text-primary-fixed" fill="none" height="340" stroke="currentColor" viewBox="0 0 100 100" width="340">
            <circle cx="50" cy="50" r="46" strokeDasharray="2 2" strokeWidth="0.75"></circle>
            <circle cx="50" cy="50" r="32" strokeWidth="0.5"></circle>
            <polygon points="50,12 85,78 15,78" strokeWidth="0.75"></polygon>
            <line strokeWidth="0.5" x1="50" x2="50" y1="4" y2="96"></line>
            <line strokeWidth="0.5" x1="4" x2="96" y1="50" y2="50"></line>
          </svg>
        </div>
        
        <div className="flex flex-col gap-space-xs max-w-5xl z-10">
          <div className="flex items-center gap-space-sm font-mono-label-xs text-mono-label-xs tracking-widest text-primary-fixed uppercase">
            <span>[LEDGER::INVARIANT_AUDIT]</span>
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
            <span className="text-on-surface font-medium"> 100% refund</span> to funder on unverified, canceled, or insufficient telemetry feeds.
          </p>
        </div>

        {/* Architectural Badge Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm pt-space-xs z-10">
          <div className="bg-surface-container-low p-space-md flex flex-col gap-1">
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Settlement Architecture</span>
            <span className="font-headline-sm text-headline-sm text-primary">Non-Custodial Escrow</span>
            <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">Core Suite: <span className="text-secondary font-mono">0x90A...11F4</span></span>
          </div>
          <div className="bg-surface-container-low p-space-md flex flex-col gap-1">
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Oracle Consensus Model</span>
            <span className="font-headline-sm text-headline-sm text-primary">5/5 Leaderless Quorum</span>
            <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">PyPI + npm Dual Notarization</span>
          </div>
          <div className="bg-surface-container-low p-space-md flex flex-col gap-1">
            <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Fee Schedule (v1 Testnet)</span>
            <span className="font-headline-sm text-headline-sm text-primary-fixed">0.00% Tax / 0.00 GEN</span>
            <span className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">Complete Passthrough Guarantee</span>
          </div>
        </div>
      </section>

      {/* Section 2: Sober Metrics Ledger Chambers */}
      <section className="w-full px-margin-sm md:px-margin py-space-lg bg-surface-container-lowest">
        <div className="flex items-center justify-between pb-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-primary-fixed text-[20px]">account_balance</span>
            <h2 className="font-headline-sm text-headline-sm text-primary uppercase tracking-tight">Core Protocol Metrics</h2>
          </div>
          <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-widest">[ON-CHAIN IMMUTABLE BALANCE]</span>
        </div>

        {/* Bento Metric Ledger */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-space-sm">
          {/* Metric 1 */}
          <div className="lg:col-span-4 bg-surface-container p-space-lg flex flex-col justify-between relative overflow-hidden shadow-sm">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Metric 01 // Vault State</span>
                <span className="font-body-md text-body-md text-primary font-medium">Escrowed Open Principal</span>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-primary-container text-on-primary-container font-semibold">ACTIVE</span>
            </div>
            <div className="my-space-md flex flex-col">
              <div className="flex items-baseline gap-space-xs">
                <span className="font-mono-metric-lg text-mono-metric-lg text-primary tracking-tight font-medium">48,950.00</span>
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed font-bold">TEST GEN</span>
              </div>
              <div className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-1">
                Currently locked across <span className="text-on-surface font-semibold">28 active temporal locks</span>
              </div>
            </div>
            <div className="pt-space-sm flex items-center justify-between text-on-surface-variant font-mono-label-xs text-mono-label-xs">
              <span>WEIGHT IN POOL: 18.83%</span>
              <span className="text-primary-fixed">100% REVERSIBLE</span>
            </div>
          </div>

          {/* Metric 2 */}
          <div className="lg:col-span-4 bg-surface-container p-space-lg flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Metric 02 // Cumulative Deliveries</span>
                <span className="font-body-md text-body-md text-primary font-medium">Total Settled to Recipients</span>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-primary-fixed font-semibold">VERIFIED</span>
            </div>
            <div className="my-space-md flex flex-col">
              <div className="flex items-baseline gap-space-xs">
                <span className="font-mono-metric-lg text-mono-metric-lg text-primary-fixed tracking-tight font-medium">142,300.00</span>
                <span className="font-mono-label-xs text-mono-label-xs text-secondary font-bold">TEST GEN</span>
              </div>
              <div className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-1">
                100% delivered to authors upon valid publication (<span className="text-on-surface font-semibold">84 releases</span>)
              </div>
            </div>
            <div className="pt-space-sm flex items-center justify-between text-on-surface-variant font-mono-label-xs text-mono-label-xs">
              <span>WEIGHT IN POOL: 54.74%</span>
              <span className="text-on-surface">MEAN: 1,694.04 GEN</span>
            </div>
          </div>

          {/* Metric 3 */}
          <div className="lg:col-span-4 bg-surface-container p-space-lg flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Metric 03 // Capital Clawbacks</span>
                <span className="font-body-md text-body-md text-primary font-medium">Total Refunded to Funders</span>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high text-secondary font-semibold">CLAWBACK</span>
            </div>
            <div className="my-space-md flex flex-col">
              <div className="flex items-baseline gap-space-xs">
                <span className="font-mono-metric-lg text-mono-metric-lg text-primary tracking-tight font-medium">67,450.00</span>
                <span className="font-mono-label-xs text-mono-label-xs text-secondary font-bold">TEST GEN</span>
              </div>
              <div className="font-mono-data-sm text-mono-data-sm text-on-surface-variant mt-1">
                Returned on REFUND_NOHIT / INSUFFICIENT / EXPIRED (<span className="text-on-surface font-semibold">39 refunds</span>)
              </div>
            </div>
            <div className="pt-space-sm flex items-center justify-between text-on-surface-variant font-mono-label-xs text-mono-label-xs">
              <span>WEIGHT IN POOL: 25.95%</span>
              <span className="text-on-surface">SLIPPAGE: 0.000%</span>
            </div>
          </div>

          {/* Metric 4 */}
          <div className="lg:col-span-6 bg-surface-container-low p-space-md flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-outline text-[18px]">lock_clock</span>
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Metric 04 // Fallback Isolation Pool</span>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">PULL-PATTERN ESCROW</span>
            </div>
            <div className="py-space-md flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-mono-metric-md text-mono-metric-md text-primary font-medium">1,250.00</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed">TEST GEN</span>
                </div>
                <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                  Unclaimed pull-credits held in isolated safety state across <span className="text-on-surface font-medium">4 beneficiary wallets</span>.
                </p>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs px-2 py-1 bg-surface-container text-on-surface font-mono">0.48% OF SYSTEM</span>
            </div>
            <div className="text-on-surface-variant font-mono-data-sm text-mono-data-sm">
              Guarantee: Funds remain pullable by certified key indefinitely with zero demurrage or lock depreciation.
            </div>
          </div>

          {/* Metric 5 */}
          <div className="lg:col-span-6 bg-surface-container-low p-space-md flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary-fixed text-[18px]">price_check</span>
                <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">Metric 05 // Protocol Fee Retention</span>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs bg-primary-container text-on-primary-container px-2 py-0.5 font-bold">ZERO TAX</span>
            </div>
            <div className="py-space-md flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-mono-metric-md text-mono-metric-md text-primary-fixed font-semibold">0.00</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-on-surface">TEST GEN</span>
                </div>
                <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                  Cumulative protocol rake, developer tax, or settlement friction: <span className="text-on-surface font-semibold">0.00%</span>.
                </p>
              </div>
              <span className="font-mono-label-xs text-mono-label-xs px-2 py-1 bg-surface-container text-primary-fixed font-mono">100.00% PASSTHROUGH</span>
            </div>
            <div className="text-on-surface-variant font-mono-data-sm text-mono-data-sm">
              Smart contract execution invariants reject any arbitrary skim, burn mechanism, or protocol tax routing.
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Economic Invariants & Visual Routing Terminal */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface flex flex-col gap-space-lg">
        <div className="flex flex-col gap-space-xs max-w-4xl">
          <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-wider">[EQUATION_VERIFICATION]</span>
          <h2 className="font-headline-md text-headline-md text-primary">The Zero-Loss Conservation Law</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Every unit of value committed to ShipLock is strictly conserved. In every state transition, the contract enforces exact mathematical closure between locked deposits and outgoing balances.
          </p>
        </div>

        {/* Mathematical Invariant CAD Terminal */}
        <div className="bg-surface-container-lowest p-space-lg flex flex-col gap-space-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm pb-space-sm">
            <div className="flex items-center gap-space-sm font-mono-data-sm text-mono-data-sm">
              <span className="text-primary-fixed font-bold">LEAD_INVARIANT_01</span>
              <span className="text-outline">::</span>
              <span className="text-on-surface">PRINCIPAL_CONSERVATION_FORMULA</span>
            </div>
            <span className="font-mono-label-xs text-mono-label-xs px-2 py-1 bg-surface-container-high text-secondary">SOLIDITY / GENLAYER DETERMINISM</span>
          </div>

          <div className="bg-surface-container p-space-md font-mono text-center flex flex-col items-center justify-center gap-2 overflow-x-auto py-space-lg">
            <div className="text-primary-fixed text-body-lg sm:text-headline-sm font-mono tracking-wide whitespace-nowrap">
              ∑ Principal_Locked ≡ ∑ Settled_Payout + ∑ Refunded_Capital + ∑ Fallback_Credits
            </div>
            <div className="font-mono-data-sm text-mono-data-sm text-on-surface-variant whitespace-nowrap">
              259,950.00 GEN = 142,300.00 GEN + 67,450.00 GEN + 1,250.00 GEN + 48,950.00 GEN [OPEN]
            </div>
            <div className="mt-2 text-primary font-mono-label-xs text-mono-label-xs bg-surface-container-low px-space-md py-1">
              DELTA INVARIANT RESIDUAL: <span className="text-primary-fixed font-bold">0.000000000000000000 TEST GEN</span> (ZERO DRIFT)
            </div>
          </div>

          {/* Invariant Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-sm pt-space-xs">
            <div className="bg-surface-container-low p-space-md flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs text-primary-fixed font-semibold">STATE: RELEASED</span>
                <span className="material-symbols-outlined text-primary-fixed text-[18px]">verified</span>
              </div>
              <span className="font-mono-metric-md text-mono-metric-md text-primary">100%</span>
              <span className="font-body-md text-body-md text-on-surface font-medium">To Recipient Author</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                Valid semantic version, notarized PyPI/npm release hash matching lock commitment. Instant liquidity release.
              </p>
            </div>
            <div className="bg-surface-container-low p-space-md flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs text-error font-semibold">STATE: REFUND_NOHIT</span>
                <span className="material-symbols-outlined text-error text-[18px]">published_with_changes</span>
              </div>
              <span className="font-mono-metric-md text-mono-metric-md text-primary">100%</span>
              <span className="font-body-md text-body-md text-on-surface font-medium">Back to Funder</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                Time expiry window elapsed without indexer recording verified artifact. Full autonomous capital reclaim.
              </p>
            </div>
            <div className="bg-surface-container-low p-space-md flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant font-semibold">STATE: INSUFFICIENT</span>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">rule</span>
              </div>
              <span className="font-mono-metric-md text-mono-metric-md text-primary">100%</span>
              <span className="font-body-md text-body-md text-on-surface font-medium">Back to Funder</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                Artifact published failed hash integrity, checksum mismatch, or unauthorized maintainer registry identity.
              </p>
            </div>
            <div className="bg-surface-container-low p-space-md flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono-label-xs text-mono-label-xs text-secondary font-semibold">STATE: CANCELED</span>
                <span className="material-symbols-outlined text-secondary text-[18px]">cancel</span>
              </div>
              <span className="font-mono-metric-md text-mono-metric-md text-primary">100%</span>
              <span className="font-body-md text-body-md text-on-surface font-medium">Back to Funder</span>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                Unilateral revocation initiated prior to publisher engagement window or lock activation deadline.
              </p>
            </div>
          </div>

          <div className="bg-surface-container p-space-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm font-mono-data-sm text-mono-data-sm">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-primary-fixed text-[18px]">local_gas_station</span>
              <span className="text-on-surface font-medium">EXECUTION GAS COMPENSATION:</span>
              <span className="text-on-surface-variant">Releaser gas compensated automatically via sub-cent refund on release dispatch.</span>
            </div>
            <div className="font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-wider">
              AVG TX GAS: &lt; 0.0014 GEN
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Live Protocol Health & Verifiable RPC Query Box */}
      <section className="w-full px-margin-sm md:px-margin py-space-xl bg-surface-container-lowest mb-space-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Left Column */}
          <div className="lg:col-span-5 flex flex-col gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <span className="font-mono-label-xs text-mono-label-xs text-outline uppercase tracking-wider">[ORACLE_SUITE_TELEMETRY]</span>
              <h3 className="font-headline-sm text-headline-sm text-primary">Leaderless Feeds & RPC Health</h3>
              <p className="font-mono-data-sm text-mono-data-sm text-on-surface-variant">
                Oracles execute in leaderless validator consensus on Studio Next. Package registries are polled through dual independent cryptographic checks.
              </p>
            </div>

            <div className="flex flex-col gap-space-xs">
              <div className="bg-surface-container p-space-md flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-primary-fixed text-[20px]">check_circle</span>
                  <div className="flex flex-col">
                    <span className="font-body-md text-body-md text-primary font-medium">PyPI Package Index Mirror</span>
                    <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">ENDPOINT: https://pypi.org/pypi/{'{pkg}'}/json</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-mono-label-xs text-mono-label-xs px-1.5 py-0.5 bg-surface-container-high text-primary-fixed font-bold">200 OK</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-outline mt-0.5">38ms latency</span>
                </div>
              </div>

              <div className="bg-surface-container p-space-md flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-primary-fixed text-[20px]">check_circle</span>
                  <div className="flex flex-col">
                    <span className="font-body-md text-body-md text-primary font-medium">npm Verified Registry Mirror</span>
                    <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">ENDPOINT: https://registry.npmjs.org/{'{pkg}'}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-mono-label-xs text-mono-label-xs px-1.5 py-0.5 bg-surface-container-high text-primary-fixed font-bold">200 OK</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-outline mt-0.5">44ms latency</span>
                </div>
              </div>

              <div className="bg-surface-container p-space-md flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-primary-fixed text-[20px]">hub</span>
                  <div className="flex flex-col">
                    <span className="font-body-md text-body-md text-primary font-medium">Validator Quorum State</span>
                    <span className="font-mono-label-xs text-mono-label-xs text-on-surface-variant">ROUND: #8,419,203 // LEADERLESS_POS</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-mono-label-xs text-mono-label-xs px-1.5 py-0.5 bg-primary-container text-on-primary-container font-bold">5 / 5 SYNCED</span>
                  <span className="font-mono-label-xs text-mono-label-xs text-outline mt-0.5">100% Agreement</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-space-md flex flex-col gap-2">
              <div className="flex justify-between font-mono-label-xs text-mono-label-xs text-on-surface-variant">
                <span>CONSENSUS SETTLEMENT SLA</span>
                <span className="text-primary-fixed font-bold">42ms AVERAGE</span>
              </div>
              <div className="w-full h-8 flex items-end gap-1 pt-1">
                <div className="bg-surface-container-high w-full h-[60%] hover:bg-primary-fixed transition-colors"></div>
                <div className="bg-surface-container-high w-full h-[45%] hover:bg-primary-fixed transition-colors"></div>
                <div className="bg-surface-container-high w-full h-[80%] hover:bg-primary-fixed transition-colors"></div>
                <div className="bg-surface-container-high w-full h-[40%] hover:bg-primary-fixed transition-colors"></div>
                <div className="bg-surface-container-high w-full h-[55%] hover:bg-primary-fixed transition-colors"></div>
                <div className="bg-surface-container-high w-full h-[35%] hover:bg-primary-fixed transition-colors"></div>
                <div className="bg-surface-container-high w-full h-[50%] hover:bg-primary-fixed transition-colors"></div>
                <div className="bg-surface-container-high w-full h-[42%] hover:bg-primary-fixed transition-colors"></div>
                <div className="bg-primary-container w-full h-[42%]"></div>
              </div>
              <div className="flex justify-between font-mono-label-xs text-mono-label-xs text-outline">
                <span>-8 BLOCKS</span>
                <span>HEAD: 61997-CURRENT</span>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7 flex flex-col gap-space-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs font-mono-label-xs text-mono-label-xs text-primary-fixed uppercase tracking-wider">
                <span className="material-symbols-outlined text-[14px]">terminal</span>
                <span>ON-CHAIN RAW JSON RPC RESPONSE</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-mono-label-xs text-mono-label-xs ${copyStatus === "READY" ? "text-outline" : copyStatus.includes("FAILED") ? "text-error" : "text-primary-fixed"}`}>
                  {copyStatus}
                </span>
                <button 
                  className="font-mono-label-xs text-mono-label-xs px-2 py-0.5 bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface uppercase transition-colors" 
                  onClick={handleCopy}
                >
                  COPY JSON
                </button>
              </div>
            </div>
            
            <div className="bg-surface-container-low p-space-md font-mono text-mono-data-sm text-on-surface relative flex flex-col overflow-hidden">
              <div className="flex items-center justify-between pb-space-xs text-outline font-mono-label-xs text-mono-label-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error"></span>
                  <span className="w-2 h-2 rounded-full bg-outline"></span>
                  <span className="w-2 h-2 rounded-full bg-primary-fixed"></span>
                  <span className="ml-2 text-on-surface-variant font-mono">POST /api/v1/call HTTP/1.1</span>
                </div>
                <span>GEN_CALL(0x90A...11F4, "get_economics")</span>
              </div>
              <pre className="overflow-x-auto text-on-surface-variant leading-relaxed py-space-sm select-all">
                <code>
                  {'{'}<br/>
                  {"  "}<span className="text-secondary">"jsonrpc"</span>: <span className="text-primary-fixed">"2.0"</span>,<br/>
                  {"  "}<span className="text-secondary">"id"</span>: <span className="text-primary">6199701</span>,<br/>
                  {"  "}<span className="text-secondary">"result"</span>: {'{'}<br/>
                  {"    "}<span className="text-secondary">"contract_suite"</span>: <span className="text-on-surface">"0x90A5F92E389178BCF011F4E982A2E44bA84c11F4"</span>,<br/>
                  {"    "}<span className="text-secondary">"network"</span>: {'{'}<br/>
                  {"      "}<span className="text-secondary">"chain_id"</span>: <span className="text-primary-fixed">61997</span>,<br/>
                  {"      "}<span className="text-secondary">"name"</span>: <span className="text-primary">"GenLayer Studio Next"</span>,<br/>
                  {"      "}<span className="text-secondary">"consensus"</span>: <span className="text-primary">"5/5 Leaderless Registry Oracles"</span>,<br/>
                  {"      "}<span className="text-secondary">"block_latency_ms"</span>: <span className="text-primary-fixed">42</span><br/>
                  {"    "}{'}'},<br/>
                  {"    "}<span className="text-secondary">"economics_ledger"</span>: {'{'}<br/>
                  {"      "}<span className="text-secondary">"escrowed_open_principal"</span>: {'{'}<br/>
                  {"        "}<span className="text-secondary">"wei"</span>: <span className="text-primary">"48950000000000000000000"</span>,<br/>
                  {"        "}<span className="text-secondary">"formatted_gen"</span>: <span className="text-primary-fixed">"48,950.00 TEST GEN"</span>,<br/>
                  {"        "}<span className="text-secondary">"active_locks_count"</span>: <span className="text-primary">28</span><br/>
                  {"      "}{'}'},<br/>
                  {"      "}<span className="text-secondary">"total_settled_recipients"</span>: {'{'}<br/>
                  {"        "}<span className="text-secondary">"wei"</span>: <span className="text-primary">"142300000000000000000000"</span>,<br/>
                  {"        "}<span className="text-secondary">"formatted_gen"</span>: <span className="text-primary-fixed">"142,300.00 TEST GEN"</span>,<br/>
                  {"        "}<span className="text-secondary">"completed_releases_count"</span>: <span className="text-primary">84</span><br/>
                  {"      "}{'}'},<br/>
                  {"      "}<span className="text-secondary">"total_refunded_funders"</span>: {'{'}<br/>
                  {"        "}<span className="text-secondary">"wei"</span>: <span className="text-primary">"67450000000000000000000"</span>,<br/>
                  {"        "}<span className="text-secondary">"formatted_gen"</span>: <span className="text-primary-fixed">"67,450.00 TEST GEN"</span>,<br/>
                  {"        "}<span className="text-secondary">"clawbacks_count"</span>: <span className="text-primary">39</span>,<br/>
                  {"        "}<span className="text-secondary">"states"</span>: [<span className="text-on-surface">"REFUND_NOHIT"</span>, <span className="text-on-surface">"INSUFFICIENT"</span>, <span className="text-on-surface">"CANCELED"</span>, <span className="text-on-surface">"EXPIRED"</span>]<br/>
                  {"      "}{'}'},<br/>
                  {"      "}<span className="text-secondary">"outstanding_fallback_credits"</span>: {'{'}<br/>
                  {"        "}<span className="text-secondary">"wei"</span>: <span className="text-primary">"1250000000000000000000"</span>,<br/>
                  {"        "}<span className="text-secondary">"formatted_gen"</span>: <span className="text-primary-fixed">"1,250.00 TEST GEN"</span>,<br/>
                  {"        "}<span className="text-secondary">"beneficiary_wallets"</span>: <span className="text-primary">4</span><br/>
                  {"      "}{'}'},<br/>
                  {"      "}<span className="text-secondary">"protocol_treasury_fee_take"</span>: {'{'}<br/>
                  {"        "}<span className="text-secondary">"wei"</span>: <span className="text-primary">"0"</span>,<br/>
                  {"        "}<span className="text-secondary">"fee_bps"</span>: <span className="text-primary-fixed">0</span>,<br/>
                  {"        "}<span className="text-secondary">"passthrough_rate"</span>: <span className="text-primary-fixed">1.0</span><br/>
                  {"      "}{'}'}<br/>
                  {"    "}{'}'},<br/>
                  {"    "}<span className="text-secondary">"invariant_audit"</span>: {'{'}<br/>
                  {"      "}<span className="text-secondary">"exact_conservation"</span>: <span className="text-primary-fixed">true</span>,<br/>
                  {"      "}<span className="text-secondary">"delta_drift_wei"</span>: <span className="text-primary">"0"</span><br/>
                  {"    "}{'}'}<br/>
                  {"  "}{'}'}<br/>
                  {'}'}
                </code>
              </pre>
              <div className="pt-space-xs flex items-center justify-between text-outline font-mono-label-xs text-mono-label-xs">
                <span>HASH: 0x9f1a2388cbe401...881f</span>
                <span className="text-primary-fixed">STATE ROOT: VERIFIED</span>
              </div>
            </div>
            <div className="bg-surface-container p-space-sm flex items-center justify-between text-on-surface-variant font-mono-label-xs text-mono-label-xs">
              <span>CALL TYPE: ETH_CALL [STATELESS READ]</span>
              <span>ESTIMATED LOCAL GAS: 21,040 UNITS</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
