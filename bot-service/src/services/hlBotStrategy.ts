import { config } from '../config';

export type HlBotStrategy = 'standard' | 'profit_grabber';

export function normalizeHlBotStrategy(raw: string | null | undefined): HlBotStrategy {
  if (raw === 'profit_grabber') return 'profit_grabber';
  return 'standard';
}

export type HlExitPolicy = {
  /** Dynamic trail — arm when ROE ≥ armMinRoePct or PnL ≥ fees × multiplier. */
  armMinRoePct: number;
  armFeesMultiplier: number;
  useTakeProfitPercent: boolean;
};

/** Exit policy — price-based dynamic trailing (no fixed USD floors). */
export function resolveHlExitPolicy(_strategy: HlBotStrategy): HlExitPolicy {
  const trail = config.hyperliquid.dynamicTrail;
  return {
    armMinRoePct: trail.armMinRoePct,
    armFeesMultiplier: trail.armFeesMultiplier,
    useTakeProfitPercent: false,
  };
}
