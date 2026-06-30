/** Arbitrum wallet that receives bot success-fee payments (10% profit share) — NOT the HL builder wallet. */

function parseAddress(raw: string | undefined): `0x${string}` | null {
  const v = raw?.trim().toLowerCase();
  if (!v || !/^0x[a-f0-9]{40}$/.test(v)) return null;
  return v as `0x${string}`;
}

export function getPlatformFeeTreasuryAddress(): `0x${string}` | null {
  return parseAddress(import.meta.env.VITE_PLATFORM_FEE_TREASURY_ADDRESS);
}
