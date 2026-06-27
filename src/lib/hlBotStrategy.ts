export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF scan. Trail SL arms after 2 min in profit (+2.5% ROE, or ≥$2 uPnL).',
  profit_grabber:
    'Aggressive: 1m scalp entries. Same trail — 2 min, then BE lock or loss stop.',
};

/** Must match bot-service config.hyperliquid.dynamicTrail defaults. */
export const HL_DYNAMIC_TRAIL = {
  armMinProfitHoldMs: 120_000,
  maxHoldBeforeSlTrailMs: 120_000,
  trailMinActiveBeforeCloseMs: 60_000,
  breakevenArmRoePct: 2.5,
  armMinProfitUsd: 2,
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
  notionalUsd: number,
  opts?: { holdMs?: number; timeInProfitMs?: number }
): boolean {
  if (pnlUsd <= 0 || collateralUsd <= 0) return false;
  const holdMs = opts?.holdMs ?? 0;
  const timeInProfitMs = opts?.timeInProfitMs ?? (pnlUsd > 0 ? holdMs : 0);
  const holdOk =
    timeInProfitMs >= HL_DYNAMIC_TRAIL.armMinProfitHoldMs ||
    holdMs >= HL_DYNAMIC_TRAIL.maxHoldBeforeSlTrailMs;
  if (!holdOk) return false;
  const fees = estimateRoundTripFeesUsd(notionalUsd);
  const roe = (pnlUsd / collateralUsd) * 100;
  const roeOk = roe >= HL_DYNAMIC_TRAIL.breakevenArmRoePct;
  const feesOk = pnlUsd >= fees * HL_DYNAMIC_TRAIL.armFeesMultiplier;
  const absOk =
    HL_DYNAMIC_TRAIL.armMinProfitUsd > 0 && pnlUsd >= HL_DYNAMIC_TRAIL.armMinProfitUsd;
  return roeOk || feesOk || absOk;
}

export function defaultTrailPctForCoin(coin: string): number {
  const c = coin.toUpperCase();
  if (c === 'BTC' || c === 'ETH') return HL_DYNAMIC_TRAIL.majorTrailPct;
  return HL_DYNAMIC_TRAIL.midTrailPct;
}
