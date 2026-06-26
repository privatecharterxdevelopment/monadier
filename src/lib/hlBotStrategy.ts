export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF scan. Trail SL arms within 2 min (+2.5% ROE in profit, or loss SL% in red).',
  profit_grabber:
    'Aggressive: 1m scalp entries. Same 2 min trail SL — breakeven or loss stop.',
};

/** Must match bot-service config.hyperliquid.dynamicTrail defaults. */
export const HL_DYNAMIC_TRAIL = {
  armMinProfitHoldMs: 120_000,
  maxHoldBeforeSlTrailMs: 120_000,
  trailMinActiveBeforeCloseMs: 60_000,
  breakevenArmRoePct: 2.5,
  armMinRoePct: 5,
  armFeesMultiplier: 2,
  estimatedFeeBpsPerSide: 3.5,
  majorTrailPct: 0.028,
  midTrailPct: 0.024,
  cautiousTrailPct: 0.038,
  breakevenBufferPct: 0.02,
} as const;

export function normalizeHlBotStrategy(raw: string | null | undefined): HlBotStrategy {
  if (raw === 'profit_grabber') return 'profit_grabber';
  return 'standard';
}

export function profitLockDisplayForStrategy(_strategy: HlBotStrategy): {
  activateUsd: number;
  floorUsd: number;
  trailBufferUsd: number;
  minHoldMs: number;
} {
  return {
    activateUsd: 0,
    floorUsd: 0,
    trailBufferUsd: 0,
    minHoldMs: 0,
  };
}

export function estimateRoundTripFeesUsd(notionalUsd: number): number {
  const bps = HL_DYNAMIC_TRAIL.estimatedFeeBpsPerSide;
  return notionalUsd * (bps / 10_000) * 2;
}

export function shouldArmDynamicTrail(
  pnlUsd: number,
  collateralUsd: number,
  notionalUsd: number
): boolean {
  if (pnlUsd <= 0 || collateralUsd <= 0) return false;
  const fees = estimateRoundTripFeesUsd(notionalUsd);
  const roe = (pnlUsd / collateralUsd) * 100;
  return roe >= HL_DYNAMIC_TRAIL.breakevenArmRoePct || pnlUsd >= fees * HL_DYNAMIC_TRAIL.armFeesMultiplier;
}

export function defaultTrailPctForCoin(coin: string): number {
  const c = coin.toUpperCase();
  if (c === 'BTC' || c === 'ETH') return HL_DYNAMIC_TRAIL.majorTrailPct;
  return HL_DYNAMIC_TRAIL.midTrailPct;
}
