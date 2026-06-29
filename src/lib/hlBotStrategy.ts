export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF trend-only. Stage 1: +0.2% ROE locks +0.1%. Stage 2: peak ≥+2% ROE → trail follows peak.',
  profit_grabber:
    'Aggressive: 1m scalp entries. Same two-stage profit SL (+0.2% lock, +2% full trail).',
};

/** Must match bot-service config.hyperliquid.dynamicTrail defaults. */
export const HL_DYNAMIC_TRAIL = {
  armMinProfitHoldMs: 0,
  maxHoldBeforeSlTrailMs: 120_000,
  trailMinActiveBeforeCloseMs: 0,
  /** Arm trail when ROE ≥ this. */
  breakevenArmRoePct: 0.2,
  armMinProfitUsd: 0,
  /** Min locked ROE% once armed. */
  armMinRoePct: 0.1,
  /** Peak ROE minus this gap when ratcheting (stage 2). */
  trailGapRoePct: 0.1,
  /** Stage 2 arms when peak ROE ≥ this. */
  fullTrailArmRoePct: 2,
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
  _notionalUsd?: number,
  opts?: { holdMs?: number; timeInProfitMs?: number; peakPnlUsd?: number }
): boolean {
  if (collateralUsd <= 0) return false;
  const peak = Math.max(pnlUsd, opts?.peakPnlUsd ?? pnlUsd);
  if (peak <= 0) return false;
  const roe = (peak / collateralUsd) * 100;
  return roe >= HL_DYNAMIC_TRAIL.breakevenArmRoePct;
}

export function defaultTrailPctForCoin(coin: string): number {
  const c = coin.toUpperCase();
  if (c === 'BTC' || c === 'ETH') return HL_DYNAMIC_TRAIL.majorTrailPct;
  return HL_DYNAMIC_TRAIL.midTrailPct;
}
