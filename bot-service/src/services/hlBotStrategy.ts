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
  /** Profit Grabber exits via lock trail only — no % TP. */
  useTakeProfitPercent: boolean;
};

/** Exit rules per bot mode — profit lock +$0.02 → floor +$0.01 is mandatory for both. */
export function resolveHlExitPolicy(strategy: HlBotStrategy): HlExitPolicy {
  const lockActivateUsd = config.hyperliquid.profitLockActivateUsd;
  const lockFloorUsd = config.hyperliquid.profitLockFloorUsd;

  if (strategy === 'profit_grabber') {
    return {
      lockActivateUsd,
      lockFloorUsd,
      trailBufferUsd: 0.01,
      useTakeProfitPercent: false,
    };
  }

  return {
    lockActivateUsd,
    lockFloorUsd,
    trailBufferUsd: config.hyperliquid.profitLockTrailBufferUsd,
    useTakeProfitPercent: true,
  };
}
