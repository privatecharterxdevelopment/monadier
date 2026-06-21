import { config } from '../config';

export type HlBotStrategy = 'standard' | 'profit_grabber';

export function normalizeHlBotStrategy(raw: string | null | undefined): HlBotStrategy {
  if (raw === 'profit_grabber') return 'profit_grabber';
  return 'standard';
}

export type HlExitPolicy = {
  lockActivateUsd: number;
  lockFloorUsd: number;
  trailBufferUsd: number;
  maxHoldInProfitMs: number;
  minProfitHoldBeforeExitMs: number;
  peakDropFraction: number;
  useTakeProfitPercent: boolean;
};

/** Let winners run — 60s min green hold, wide trail, no timeout grab. */
export function resolveHlExitPolicy(strategy: HlBotStrategy): HlExitPolicy {
  const base = {
    minProfitHoldBeforeExitMs: config.hyperliquid.profitMinHoldBeforeExitMs,
    peakDropFraction: config.hyperliquid.profitPeakDropFraction,
    maxHoldInProfitMs: 0,
    useTakeProfitPercent: false,
  };

  if (strategy === 'profit_grabber') {
    return {
      ...base,
      lockActivateUsd: 0.06,
      lockFloorUsd: 0.015,
      trailBufferUsd: 0.035,
    };
  }

  return {
    ...base,
    lockActivateUsd: config.hyperliquid.profitLockActivateUsd,
    lockFloorUsd: config.hyperliquid.profitLockFloorUsd,
    trailBufferUsd: config.hyperliquid.profitLockTrailBufferUsd,
  };
}
