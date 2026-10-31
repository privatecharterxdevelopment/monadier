/** Arbitrum USDC receiver for bot success fees — same admin builder wallet as HL builder. */

import { getAddress } from 'viem';
import { HL_PLATFORM_DEFAULT_BUILDER } from './hlPlatform';

function parseChecksumAddress(raw: string | undefined): `0x${string}` | null {
  const v = raw?.trim();
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) return null;
  try {
    if (v.toLowerCase() === HL_PLATFORM_DEFAULT_BUILDER.toLowerCase()) {
      return HL_PLATFORM_DEFAULT_BUILDER;
    }
    return getAddress(v) as `0x${string}`;
  } catch {
    return null;
  }
}

export function getPlatformFeeTreasuryAddress(): `0x${string}` | null {
  return (
    parseChecksumAddress(import.meta.env.VITE_PLATFORM_FEE_TREASURY_ADDRESS) ??
    parseChecksumAddress(import.meta.env.VITE_HL_BUILDER_ADDRESS) ??
    HL_PLATFORM_DEFAULT_BUILDER
  );
}
