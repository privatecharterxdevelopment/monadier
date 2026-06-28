import { config } from '../config';
import { logger } from '../utils/logger';
import { fetchHlPerpFundingSnapshot } from './hlInfo';
import { parseMaxBuilderTenthsBps } from './hlBuilderFee';

/** Hyperliquid builder wallet minimum (unified accounts: spot USDC counts). */
export const HL_BUILDER_MIN_PLATFORM_USD = 100;
/** Bridge/deposit fees often leave ~$99.9 — treat ≥$99 as funded. */
const HL_BUILDER_READY_FLOOR_USD = 99;

export async function fetchHlBuilderPlatformReady(builderAddress?: string): Promise<{
  ready: boolean;
  builderAddress: string;
  accountUsd: number;
  perpUsd: number;
  spotUsdcUsd: number;
  unifiedAccount: boolean;
  minUsd: number;
}> {
  const addr = (builderAddress ?? config.hyperliquid.builderAddress)?.toLowerCase() ?? '';
  const minUsd = HL_BUILDER_MIN_PLATFORM_USD;
  if (!addr || !/^0x[a-f0-9]{40}$/.test(addr)) {
    return {
      ready: false,
      builderAddress: addr,
      accountUsd: 0,
      perpUsd: 0,
      spotUsdcUsd: 0,
      unifiedAccount: false,
      minUsd,
    };
  }

  const funding = await fetchHlPerpFundingSnapshot(addr);
  const accountUsd = funding.tradablePerpUsd;
  const ready = accountUsd >= HL_BUILDER_READY_FLOOR_USD;

  return {
    ready,
    builderAddress: addr,
    accountUsd,
    perpUsd: funding.perpUsd,
    spotUsdcUsd: funding.spotUsdcUsd,
    unifiedAccount: funding.unifiedAccount,
    minUsd,
  };
}

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

export function hlBuilderFeeConfigured(): boolean {
  return Boolean(config.hyperliquid.builderAddress);
}

/** @deprecated Use checkHlBuilderFeeApproved — requires async platform check. */
export function hlBuilderFeeRequired(): boolean {
  return hlBuilderFeeConfigured();
}

export function isHlBuilderFeeApproved(approvedMaxTenthsBps: number): boolean {
  if (!hlBuilderFeeConfigured()) return true;
  const required = parseMaxBuilderTenthsBps(
    config.hyperliquid.builderMaxApprovalRate || '0.1%'
  );
  const openNeeded = config.hyperliquid.openBuilderFeePerp || 0;
  return approvedMaxTenthsBps >= Math.max(required, openNeeded);
}

export async function checkHlBuilderFeeApproved(userAddress: string): Promise<{
  required: boolean;
  approved: boolean;
  approvedMax: number;
  requiredFee: number;
  builderAddress: string | null;
  platformReady: boolean;
  platformAccountUsd: number;
  platformMinUsd: number;
  feeCollectionActive: boolean;
}> {
  const builderAddress = config.hyperliquid.builderAddress;
  if (!builderAddress || !hlBuilderFeeConfigured()) {
    return {
      required: false,
      approved: true,
      approvedMax: 0,
      requiredFee: 0,
      builderAddress: null,
      platformReady: true,
      platformAccountUsd: 0,
      platformMinUsd: HL_BUILDER_MIN_PLATFORM_USD,
      feeCollectionActive: false,
    };
  }

  const platform = await fetchHlBuilderPlatformReady(builderAddress);
  if (!platform.ready) {
    return {
      required: false,
      approved: true,
      approvedMax: 0,
      requiredFee: config.hyperliquid.builderFeePerp,
      builderAddress,
      platformReady: false,
      platformAccountUsd: platform.accountUsd,
      platformMinUsd: platform.minUsd,
      feeCollectionActive: false,
    };
  }

  const approvedMax = await fetchHlMaxBuilderFee(userAddress, builderAddress);
  const approved = isHlBuilderFeeApproved(approvedMax);
  return {
    required: true,
    approved,
    approvedMax,
    requiredFee: config.hyperliquid.builderFeePerp,
    builderAddress,
    platformReady: true,
    platformAccountUsd: platform.accountUsd,
    platformMinUsd: platform.minUsd,
    feeCollectionActive: approved,
  };
}
