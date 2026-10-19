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
  policy?: string;
  expectedRepo?: string;
  expectedTag?: string;
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
 * Validates a GitHub repository in canonical owner/repo format.
 */
export function validateGithubRepo(repo: string): { valid: boolean; normalized?: string; error?: string } {
  if (typeof repo !== "string" || !repo || repo !== repo.trim()) {
    return { valid: false, error: "Repository cannot be empty or have leading/trailing whitespace" };
  }
  const s = repo.trim();
  if (s.length < 3 || s.length > 128) return { valid: false, error: "Repository length must be 3-128 characters" };
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 33 || code > 126) {
      return { valid: false, error: "Repository contains whitespace, control character, or non-ASCII" };
    }
  }
  if (s.includes("://") || s.startsWith("//")) return { valid: false, error: "Enter canonical 'owner/repo' without scheme or URL" };
  if (s.includes("?") || s.includes("#")) return { valid: false, error: "Repository cannot contain query or fragment" };
  if (s.includes("..")) return { valid: false, error: "Path traversal is not permitted" };
  if (s.includes("\\")) return { valid: false, error: "Backslash is not permitted" };
  if (/[?#%\\@~;&:$!*()+=[\\]{}|^<>"`']/.test(s)) return { valid: false, error: "Repository contains invalid characters" };
  const parts = s.split("/");
  if (parts.length !== 2) return { valid: false, error: "Must be in canonical 'owner/repo' format (e.g. facebook/react)" };
  const [owner, repoName] = parts;
  if (!owner || !repoName) return { valid: false, error: "Owner and repo cannot be empty" };
  if (owner.length > 39) return { valid: false, error: "Owner cannot exceed 39 characters" };
  if (repoName.length > 100) return { valid: false, error: "Repository name cannot exceed 100 characters" };
  if (owner.startsWith("-") || owner.endsWith("-") || owner.includes("--")) {
    return { valid: false, error: "Owner cannot start/end with hyphen or have consecutive hyphens" };
  }
  if (!/^[a-zA-Z0-9-]+$/.test(owner)) return { valid: false, error: "Owner must be alphanumeric with single hyphens" };
  if (repoName === "." || repoName === ".." || repoName.endsWith(".git") || repoName.startsWith(".") || repoName.startsWith("-")) {
    return { valid: false, error: "Invalid repository name syntax" };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(repoName)) return { valid: false, error: "Repository name contains invalid characters" };
  return { valid: true, normalized: `${owner.toLowerCase()}/${repoName.toLowerCase()}` };
}

/**
 * Validates a GitHub release tag according to strict git ref safety rules.
 */
export function validateGithubTag(tag: string): { valid: boolean; normalized?: string; error?: string } {
  if (typeof tag !== "string" || !tag || tag !== tag.trim()) {
    return { valid: false, error: "Release tag cannot be empty or have leading/trailing whitespace" };
  }
  const t = tag.trim();
  if (t.length < 1 || t.length > 128) return { valid: false, error: "Tag length must be 1-128 characters" };
  for (let i = 0; i < t.length; i++) {
    const code = t.charCodeAt(i);
    if (code < 33 || code > 126) {
      return { valid: false, error: "Tag contains whitespace, control character, or non-ASCII" };
    }
  }
  if (t.includes("/") || t.includes("\\")) return { valid: false, error: "Tag cannot contain slash or backslash" };
  if (t.includes("?") || t.includes("#")) return { valid: false, error: "Tag cannot contain query or fragment" };
  if (t.includes("://") || t.startsWith("//")) return { valid: false, error: "Tag cannot contain URL scheme" };
  const forbidden = ["~", "^", ":", "*", "[", "]", "@{", "@", "$", ";", "&", "|", "<", ">", '"', "'", "`", "%"];
  for (const f of forbidden) {
    if (t.includes(f)) return { valid: false, error: `Tag contains forbidden character: ${f}` };
  }
  if (t.includes("..") || t === "." || t.startsWith(".") || t.endsWith(".") || t.endsWith(".lock")) {
    return { valid: false, error: "Invalid tag syntax" };
  }
  return { valid: true, normalized: t };
}

/**
 * Deterministically derives the expected escrow ID from canonical transaction inputs.
 * Exact parity with Python contracts/shiplock.py.
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

  const isVerified = inputs.policy === "SOURCE_LINKED" || (Boolean(inputs.expectedRepo) && Boolean(inputs.expectedTag));
  if (isVerified) {
    const repo = (inputs.expectedRepo || "").trim().toLowerCase();
    const tag = (inputs.expectedTag || "").trim();
    const preimage = `${funderHex}|${payeeHex}|${template}|${pkg}|${ver}|${repo}|${tag}|${startIso}|${endIso}|${amountStr}|${nonceStr}`;
    return sha256(stringToBytes(preimage));
  }

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
