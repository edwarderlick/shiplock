import { sha256, stringToBytes } from "viem";

export interface EscrowPreimageInputs {
  funder: string;
  recipient: string;
  template: string;
  packageName: string;
  version: string;
  windowStartUtc: string;
  windowEndUtc: string;
  amountWei: bigint | string;
  nonce: bigint | string;
}

/**
 * Normalizes an ISO date string or Date to canonical format: YYYY-MM-DDTHH:mm:ssZ (no milliseconds)
 */
export function normalizeIsoUtc(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${String(input)}`);
  }
  return d.toISOString().split(".")[0] + "Z";
}

/**
 * Deterministically derives the expected escrow ID from canonical transaction inputs.
 * Exact parity with Python contracts/shiplock.py:
 * raw = f"{funder_hex}|{payee_hex}|{template}|{pkg}|{ver}|{_iso(start_dt)}|{_iso(end_dt)}|{int(amount)}|{int(nonce)}".encode("utf-8")
 * id_hash = "0x" + hashlib.sha256(raw).hexdigest()
 */
export function deriveEscrowId(inputs: EscrowPreimageInputs): `0x${string}` {
  const funderHex = inputs.funder.trim().toLowerCase();
  const payeeHex = inputs.recipient.trim().toLowerCase();
  const template = inputs.template.trim();
  const pkg = inputs.packageName.trim();
  const ver = inputs.version.trim();
  const startIso = normalizeIsoUtc(inputs.windowStartUtc);
  const endIso = normalizeIsoUtc(inputs.windowEndUtc);
  const amountStr = BigInt(inputs.amountWei).toString();
  const nonceStr = BigInt(inputs.nonce).toString();

  const preimage = `${funderHex}|${payeeHex}|${template}|${pkg}|${ver}|${startIso}|${endIso}|${amountStr}|${nonceStr}`;
  return sha256(stringToBytes(preimage));
}

/**
 * Generates a unique unsigned 256-bit bigint nonce for escrow funding.
 * Combines high-resolution millisecond timestamp with cryptographically random bits.
 */
export function generateEscrowNonce(): bigint {
  const now = BigInt(Date.now());
  const randomUint32 = typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues
    ? BigInt(globalThis.crypto.getRandomValues(new Uint32Array(1))[0])
    : BigInt(Math.floor(Math.random() * 0xffffffff));

  return (now << 32n) | randomUint32;
}
