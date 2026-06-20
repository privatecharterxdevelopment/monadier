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
  useTakeProfitPercent: boolean;
};

/** Aggressive (profit_grabber): tight trail. Standard: slightly wider — both profit-lock first. */
export function resolveHlExitPolicy(strategy: HlBotStrategy): HlExitPolicy {
  if (strategy === 'profit_grabber') {
    return {
      lockActivateUsd: 0.015,
      lockFloorUsd: 0.008,
      trailBufferUsd: 0.006,
      maxHoldInProfitMs: config.hyperliquid.profitGrabMaxHoldMs,
      useTakeProfitPercent: false,
    };
  }

  return {
    lockActivateUsd: config.hyperliquid.profitLockActivateUsd,
    lockFloorUsd: config.hyperliquid.profitLockFloorUsd,
    trailBufferUsd: config.hyperliquid.profitLockTrailBufferUsd,
    maxHoldInProfitMs: config.hyperliquid.profitHoldMaxMs,
    useTakeProfitPercent: false,
  };
}
