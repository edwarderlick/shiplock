export function formatAddress(address: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 5)}...${address.slice(-4)}`;
}

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0.00 GEN";
  return `${num.toFixed(2)} GEN`;
}
