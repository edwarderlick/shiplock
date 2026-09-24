"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { STUDIO_NEXT, ADD_CHAIN_PARAMS } from "./network";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletOption {
  /** Where the provider came from */
  source: "eip6963" | "legacy-list" | "legacy";
  name: string;
  rdns: string;
  icon: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any;
}

interface WalletState {
  address: string | null;
  chainId: number | null;
  balance: string; // formatted GEN, e.g. "420.50"
  isWrongNetwork: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedProvider: any | null;
  options: WalletOption[];          // discovered wallets (populated lazily)
  isDiscovering: boolean;
  connectError: string | null;
}

interface WalletContextType extends WalletState {
  /** Open the picker: discovers wallets and returns them. Does NOT connect. */
  discover: () => Promise<WalletOption[]>;
  /** Connect with the chosen option only. Throws human-readable string on failure. */
  connect: (option: WalletOption) => Promise<void>;
  switchOrAddStudioNext: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_KEY = "shiplock_connected_rdns";

function labelProvider(p: { isMetaMask?: boolean; isRabby?: boolean; isCoinbaseWallet?: boolean; isBraveWallet?: boolean; isOkxWallet?: boolean }): string {
  if (p.isMetaMask) return "MetaMask";
  if (p.isRabby) return "Rabby";
  if (p.isCoinbaseWallet) return "Coinbase Wallet";
  if (p.isBraveWallet) return "Brave";
  if (p.isOkxWallet) return "OKX";
  return "Injected";
}

/**
 * EIP-6963 multi-wallet discovery algorithm exactly as specified.
 * DOES NOT call eth_requestAccounts.
 */
async function discoverProviders(): Promise<WalletOption[]> {
  if (typeof window === "undefined") return [];

  const options: WalletOption[] = [];
  const seen = new Set<string>();

  const handleAnnounce = (event: Event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { info, provider } = (event as CustomEvent).detail as {
      info: { uuid: string; name: string; rdns: string; icon: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: any;
    };
    if (seen.has(info.uuid)) return;
    seen.add(info.uuid);
    options.push({ source: "eip6963", name: info.name, rdns: info.rdns, icon: info.icon, provider });
  };

  window.addEventListener("eip6963:announceProvider", handleAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Give wallets 300ms to announce themselves
  await new Promise<void>((res) => setTimeout(res, 300));
  window.removeEventListener("eip6963:announceProvider", handleAnnounce);

  if (options.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (eth?.providers && Array.isArray(eth.providers) && eth.providers.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eth.providers.forEach((p: any, i: number) => {
        options.push({
          source: "legacy-list",
          name: labelProvider(p),
          rdns: `injected-${i}`,
          icon: "",
          provider: p,
        });
      });
    } else if (eth) {
      options.push({
        source: "legacy",
        name: "Injected",
        rdns: "injected",
        icon: "",
        provider: eth,
      });
    }
  }

  return options;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextType>({} as WalletContextType);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    balance: "0.00",
    isWrongNetwork: false,
    selectedProvider: null,
    options: [],
    isDiscovering: false,
    connectError: null,
  });

  // Track active subscriptions so we can remove them on disconnect
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeProvider = useRef<any | null>(null);

  // ── Session restore (sessionStorage ONLY — never silent-connect from localStorage) ──
  useEffect(() => {
    const prevRdns = sessionStorage.getItem(SESSION_KEY);
    if (!prevRdns) return; // no previous session → do nothing, no popup

    // Discover providers silently and reconnect only if same rdns is found
    discoverProviders().then(async (opts) => {
      const match = opts.find((o) => o.rdns === prevRdns);
      if (!match) return;
      // Session was active, silently restore
      try {
        await connectInternal(match, opts);
      } catch {
        // Session expired or wallet locked — clear silently
        sessionStorage.removeItem(SESSION_KEY);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Internal helpers ──────────────────────────────────────────────────────

  function subscribeToProvider(provider: unknown) {
    if (!provider || typeof provider !== "object") return;
    const p = provider as { on?: (evt: string, cb: (...a: unknown[]) => void) => void };
    if (typeof p.on !== "function") return;

    p.on("accountsChanged", (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        disconnectInternal();
      } else {
        setState((prev) => ({ ...prev, address: accs[0] }));
      }
    });

    p.on("chainChanged", (chainIdHex: unknown) => {
      const id = parseInt(chainIdHex as string, 16);
      setState((prev) => ({
        ...prev,
        chainId: id,
        isWrongNetwork: id !== STUDIO_NEXT.chainId,
      }));
    });

    p.on("disconnect", () => {
      disconnectInternal();
    });
  }

  function disconnectInternal() {
    if (activeProvider.current) {
      // Some wallets expose removeListener
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = activeProvider.current as any;
      if (typeof p.removeAllListeners === "function") p.removeAllListeners();
    }
    activeProvider.current = null;
    sessionStorage.removeItem(SESSION_KEY);
    setState((prev) => ({
      ...prev,
      address: null,
      chainId: null,
      balance: "0.00",
      isWrongNetwork: false,
      selectedProvider: null,
      connectError: null,
    }));
  }

  async function connectInternal(option: WalletOption, knownOptions?: WalletOption[]) {
    const { provider, rdns } = option;

    // Request accounts from THIS provider only
    const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) throw new Error("No accounts returned.");

    const address = accounts[0];
    const chainIdHex: string = await provider.request({ method: "eth_chainId" });
    const chainId = parseInt(chainIdHex, 16);

    // Attempt balance read — fail gracefully
    let balance = "0.00";
    try {
      const balHex: string = await provider.request({
        method: "eth_getBalance",
        params: [address, "latest"],
      });
      const wei = BigInt(balHex);
      const gen = Number(wei) / 1e18;
      balance = gen.toFixed(2);
    } catch {
      balance = "0.00";
    }

    activeProvider.current = provider;
    sessionStorage.setItem(SESSION_KEY, rdns);

    setState((prev) => ({
      ...prev,
      address,
      chainId,
      balance,
      isWrongNetwork: chainId !== STUDIO_NEXT.chainId,
      selectedProvider: provider,
      options: knownOptions ?? prev.options,
      connectError: null,
    }));

    subscribeToProvider(provider);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  const discover = async (): Promise<WalletOption[]> => {
    setState((prev) => ({ ...prev, isDiscovering: true, connectError: null }));
    const opts = await discoverProviders();
    setState((prev) => ({ ...prev, options: opts, isDiscovering: false }));
    return opts;
  };

  const connect = async (option: WalletOption): Promise<void> => {
    setState((prev) => ({ ...prev, connectError: null }));
    try {
      await connectInternal(option);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      let msg: string;
      if (code === 4001 || code === -32603) {
        msg = "Connection rejected.";
      } else {
        msg = "No browser wallet found. Install MetaMask, Rabby, Brave, Coinbase, or OKX.";
      }
      setState((prev) => ({ ...prev, connectError: msg }));
      throw new Error(msg);
    }
  };

  const switchOrAddStudioNext = async (): Promise<void> => {
    if (!state.selectedProvider) return;
    const provider = state.selectedProvider;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: STUDIO_NEXT.chainIdHex }],
      });
    } catch (switchErr: unknown) {
      const code = (switchErr as { code?: number })?.code;
      const msg = (switchErr as { message?: string })?.message ?? "";
      // 4902 = chain not added; some wallets use -32603 or message heuristic
      const isUnknownChain =
        code === 4902 || msg.toLowerCase().includes("unrecognized") || msg.toLowerCase().includes("unknown");

      if (isUnknownChain) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [ADD_CHAIN_PARAMS],
          });
          // After add, try switch again
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: STUDIO_NEXT.chainIdHex }],
          });
        } catch (addErr: unknown) {
          const addCode = (addErr as { code?: number })?.code;
          const msg = addCode === 4001 ? "Network switch rejected." : String((addErr as Error).message ?? "Network switch rejected.");
          setState((prev) => ({ ...prev, connectError: msg }));
          throw new Error(msg);
        }
      } else if (code === 4001) {
        const m = "Network switch rejected.";
        setState((prev) => ({ ...prev, connectError: m }));
        throw new Error(m);
      } else {
        const m = String(msg || "Network switch rejected.");
        setState((prev) => ({ ...prev, connectError: m }));
        throw new Error(m);
      }
    }
  };

  const disconnect = () => disconnectInternal();

  const clearError = () => setState((prev) => ({ ...prev, connectError: null }));

  return (
    <WalletContext.Provider
      value={{
        ...state,
        discover,
        connect,
        switchOrAddStudioNext,
        disconnect,
        clearError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
