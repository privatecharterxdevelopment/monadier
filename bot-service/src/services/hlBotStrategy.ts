import { resolveEffectiveTrailProfile } from './dynamicTrailingStop';

export type HlBotStrategy = 'standard' | 'profit_grabber';

export function normalizeHlBotStrategy(raw: string | null | undefined): HlBotStrategy {
  if (raw === 'profit_grabber') return 'profit_grabber';
  return 'standard';
}

export type HlExitPolicy = {
  /** Stage 1 — breakeven lock at this ROE. */
  breakevenArmRoePct: number;
  /** Stage 2 — full trail at this ROE. */
  armMinRoePct: number;
  armFeesMultiplier: number;
  useTakeProfitPercent: boolean;
};

/** Exit policy — price-based dynamic trailing; 40×+ uses loosened high-lev profile. */
export function resolveHlExitPolicy(
  _strategy: HlBotStrategy,
  leverage = 1
): HlExitPolicy {
  const trail = resolveEffectiveTrailProfile(leverage);
  return {
    breakevenArmRoePct: trail.breakevenArmRoePct,
    armMinRoePct: trail.armMinRoePct,
    armFeesMultiplier: trail.armFeesMultiplier,
    useTakeProfitPercent: false,
  };
}
