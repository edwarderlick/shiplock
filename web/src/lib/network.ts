// GenLayer Studio Next — Phase 1.5
// DO NOT change these values. chainId 61997 = 0xF22D.
// studio-dev.genlayer.com is NOT studionet (61999). Never use 61999.

export const STUDIO_NEXT = {
  chainId: 61997,
  chainIdHex: "0xF22D",
  chainName: "GenLayer Studio Next",
  rpcUrl: "https://studio-dev.genlayer.com/api",
  explorer: "https://explorer-studio-dev.genlayer.com",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
} as const;

// wallet_addEthereumChain params shape (keeps the wallet.ts call concise)
export const ADD_CHAIN_PARAMS = {
  chainId: STUDIO_NEXT.chainIdHex,
  chainName: STUDIO_NEXT.chainName,
  nativeCurrency: STUDIO_NEXT.nativeCurrency,
  rpcUrls: [STUDIO_NEXT.rpcUrl],
  blockExplorerUrls: [STUDIO_NEXT.explorer],
} as const;
