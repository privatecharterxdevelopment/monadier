import { config } from '../config';

export type HlBotStrategy = 'standard' | 'profit_grabber';

export function normalizeHlBotStrategy(raw: string | null | undefined): HlBotStrategy {
  if (raw === 'profit_grabber') return 'profit_grabber';
  return 'standard';
}

export type HlExitPolicy = {
  /** Stage 1 — breakeven lock at this ROE (default ~2%). */
  breakevenArmRoePct: number;
  /** Stage 2 — full trail at this ROE (default ~4.5%). */
  armMinRoePct: number;
  armFeesMultiplier: number;
  useTakeProfitPercent: boolean;
};

/** Exit policy — price-based dynamic trailing (no fixed USD floors). */
export function resolveHlExitPolicy(_strategy: HlBotStrategy): HlExitPolicy {
  const trail = config.hyperliquid.dynamicTrail;
  return {
    breakevenArmRoePct: trail.breakevenArmRoePct,
    armMinRoePct: trail.armMinRoePct,
    armFeesMultiplier: trail.armFeesMultiplier,
    useTakeProfitPercent: false,
  };
}
