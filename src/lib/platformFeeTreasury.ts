/** Arbitrum USDC receiver for bot success fees — same admin builder wallet as HL builder. */

import { HL_PLATFORM_DEFAULT_BUILDER } from './hlPlatform';

function parseAddress(raw: string | undefined): `0x${string}` | null {
  const v = raw?.trim().toLowerCase();
  if (!v || !/^0x[a-f0-9]{40}$/.test(v)) return null;
  return v as `0x${string}`;
}

export function getPlatformFeeTreasuryAddress(): `0x${string}` | null {
  return (
    parseAddress(import.meta.env.VITE_PLATFORM_FEE_TREASURY_ADDRESS) ??
    parseAddress(import.meta.env.VITE_HL_BUILDER_ADDRESS) ??
    (HL_PLATFORM_DEFAULT_BUILDER.toLowerCase() as `0x${string}`)
  );
}
