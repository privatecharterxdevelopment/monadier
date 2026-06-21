export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF scan. Dynamic ATR trail — arms at +0.5% ROE, lets winners run hours.',
  profit_grabber:
    'Aggressive: 1m scalp entries. Same dynamic price trail — no fixed $0.02 floor.',
};

/** Must match bot-service config.hyperliquid.dynamicTrail defaults. */
export const HL_DYNAMIC_TRAIL = {
  armMinRoePct: 0.5,
  armFeesMultiplier: 2,
  estimatedFeeBpsPerSide: 3.5,
  majorTrailPct: 0.0125,
  midTrailPct: 0.0175,
  cautiousTrailPct: 0.0325,
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
  const fees = estimateRoundTripFeesUsd(notionalUsd);
  const roe = collateralUsd > 0 ? (pnlUsd / collateralUsd) * 100 : 0;
  return (
    pnlUsd >= fees * HL_DYNAMIC_TRAIL.armFeesMultiplier ||
    roe >= HL_DYNAMIC_TRAIL.armMinRoePct
  );
}

export function defaultTrailPctForCoin(_coin: string): number {
  return HL_DYNAMIC_TRAIL.midTrailPct;
}
