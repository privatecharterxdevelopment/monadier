import { config } from '../config';
import { logger } from '../utils/logger';

export async function fetchHlMaxBuilderFee(
  userAddress: string,
  builderAddress: string
): Promise<number> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'maxBuilderFee',
        user: userAddress.toLowerCase(),
        builder: builderAddress.toLowerCase(),
      }),
    });
    if (!res.ok) return 0;
    const fee = await res.json();
    return Number(fee) || 0;
  } catch (err: unknown) {
    logger.debug('HL maxBuilderFee failed', {
      user: userAddress.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

export function hlBuilderFeeRequired(): boolean {
  return Boolean(
    config.hyperliquid.builderAddress && config.hyperliquid.builderFeePerp > 0
  );
}

export function isHlBuilderFeeApproved(approvedMaxTenthsBps: number): boolean {
  if (!hlBuilderFeeRequired()) return true;
  return approvedMaxTenthsBps >= config.hyperliquid.builderFeePerp;
}

export async function checkHlBuilderFeeApproved(userAddress: string): Promise<{
  required: boolean;
  approved: boolean;
  approvedMax: number;
  requiredFee: number;
  builderAddress: string | null;
}> {
  const required = hlBuilderFeeRequired();
  const builderAddress = required ? config.hyperliquid.builderAddress : null;
  const requiredFee = config.hyperliquid.builderFeePerp;

  if (!required || !builderAddress) {
    return {
      required: false,
      approved: true,
      approvedMax: 0,
      requiredFee: 0,
      builderAddress: null,
    };
  }

  const approvedMax = await fetchHlMaxBuilderFee(userAddress, builderAddress);
  return {
    required: true,
    approved: isHlBuilderFeeApproved(approvedMax),
    approvedMax,
    requiredFee,
    builderAddress,
  };
}
