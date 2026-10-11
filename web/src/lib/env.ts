const rawAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim();

export const IS_CONTRACT_ADDRESS_VALID = /^0x[0-9a-fA-F]{40}$/.test(rawAddress);

export function getValidatedContractAddress(): `0x${string}` {
  if (!IS_CONTRACT_ADDRESS_VALID) {
    throw new Error(
      `NEXT_PUBLIC_CONTRACT_ADDRESS is missing or invalid ("${rawAddress}"). Expected a 20-byte hex address (0x followed by 40 hex characters).`
    );
  }
  return rawAddress as `0x${string}`;
}

/**
 * Validated canonical contract address for all reads and writes.
 * If NEXT_PUBLIC_CONTRACT_ADDRESS is missing or invalid, this will be an empty string,
 * causing reads/writes to fail visibly rather than silently targeting a stale deployment.
 */
export const CONTRACT_ADDRESS: `0x${string}` = (
  IS_CONTRACT_ADDRESS_VALID ? rawAddress : ""
) as `0x${string}`;

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "61997");
export const STUDIO_RPC = process.env.NEXT_PUBLIC_STUDIO_RPC ?? "https://studio-dev.genlayer.com/api";
export const STUDIO_EXPLORER = process.env.NEXT_PUBLIC_STUDIO_EXPLORER ?? "https://explorer-studio-dev.genlayer.com";
