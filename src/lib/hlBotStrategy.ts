export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF trend-only. Profit floor after 2m green (stays in plus); full trail +15% ROE.',
  profit_grabber:
    'Aggressive: 1m scalp entries. Same 2m green profit floor and ROE trail gates.',
};

/** Must match bot-service config.hyperliquid.dynamicTrail defaults. */
export const HL_DYNAMIC_TRAIL = {
  armMinProfitHoldMs: 120_000,
  maxHoldBeforeSlTrailMs: 120_000,
  trailMinActiveBeforeCloseMs: 120_000,
  longMinGreenHoldMs: 120_000,
  longTrailMinActiveMult: 1,
  breakevenArmRoePct: 8,
  armMinProfitUsd: 0,
  armMinRoePct: 15,
  trailGapRoePct: 3,
  fullTrailArmRoePct: 15,
  longTrailArmRoePct: 22,
  armFeesMultiplier: 4,
  estimatedFeeBpsPerSide: 3.5,
  majorTrailPct: 0.068,
  midTrailPct: 0.058,
  cautiousTrailPct: 0.072,
  breakevenBufferPct: 0.02,
} as const;

/** High-leverage ROE gates only — hold times stay 2m (same as bot). */
export const HL_DYNAMIC_TRAIL_40X = {
  breakevenArmRoePct: 8,
  armMinRoePct: 15,
  fullTrailArmRoePct: 15,
  trailGapRoePct: 3,
  longTrailArmRoePct: 22,
  majorTrailPct: 0.068,
  midTrailPct: 0.058,
  cautiousTrailPct: 0.072,
} as const;

export function trailProfileForLeverage(leverage: number) {
  return leverage >= 40 ? { ...HL_DYNAMIC_TRAIL, ...HL_DYNAMIC_TRAIL_40X } : HL_DYNAMIC_TRAIL;
}

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
    minHoldMs: HL_DYNAMIC_TRAIL.armMinProfitHoldMs,
  };
}

export function estimateRoundTripFeesUsd(notionalUsd: number): number {
  const bps = HL_DYNAMIC_TRAIL.estimatedFeeBpsPerSide;
  return notionalUsd * (bps / 10_000) * 2;
}

export function shouldArmDynamicTrail(
  pnlUsd: number,
  collateralUsd: number,
  _notionalUsd?: number,
  opts?: { holdMs?: number; timeInProfitMs?: number; peakPnlUsd?: number }
): boolean {
  if (collateralUsd <= 0) return false;
  const peak = Math.max(pnlUsd, opts?.peakPnlUsd ?? pnlUsd);
  if (peak <= 0) return false;
  if (HL_DYNAMIC_TRAIL.armMinProfitUsd > 0 && peak < HL_DYNAMIC_TRAIL.armMinProfitUsd) {
    return false;
  }
  const timeInProfitMs = opts?.timeInProfitMs ?? 0;
  if (timeInProfitMs < HL_DYNAMIC_TRAIL.armMinProfitHoldMs) return false;
  return true;
}

export function defaultTrailPctForCoin(coin: string): number {
  const c = coin.toUpperCase();
  if (c === 'BTC' || c === 'ETH') return HL_DYNAMIC_TRAIL.majorTrailPct;
  return HL_DYNAMIC_TRAIL.midTrailPct;
}
