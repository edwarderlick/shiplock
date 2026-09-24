export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x53EAd6deB8103B278e663Bc9808926FB7B308a63").trim();
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "61997");
export const STUDIO_RPC = process.env.NEXT_PUBLIC_STUDIO_RPC ?? "https://studio-dev.genlayer.com/api";
export const STUDIO_EXPLORER = process.env.NEXT_PUBLIC_STUDIO_EXPLORER ?? "https://explorer-studio-dev.genlayer.com/";
