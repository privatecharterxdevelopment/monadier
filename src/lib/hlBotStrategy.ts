export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF trend scan. First 2.5 min in profit = live analyze (macro/MTF/vol). Then trail SL in profit.',
  profit_grabber:
    'Aggressive: 1m scalp entries. Same 2.5 min green analyze window before profit trail SL.',
};

/** Must match bot-service resolveHlExitPolicy. */
export const HL_AGGRESSIVE_PROFIT_LOCK = {
  activateUsd: 0.05,
  floorUsd: 0.015,
  trailBufferUsd: 0.035,
  minHoldMs: 150_000,
} as const;

export const HL_STANDARD_PROFIT_LOCK = {
  activateUsd: 0.05,
  floorUsd: 0.02,
  trailBufferUsd: 0.045,
  minHoldMs: 150_000,
} as const;

export function normalizeHlBotStrategy(raw: string | null | undefined): HlBotStrategy {
  if (raw === 'profit_grabber') return 'profit_grabber';
  return 'standard';
}

export function profitLockDisplayForStrategy(strategy: HlBotStrategy): {
  activateUsd: number;
  floorUsd: number;
  trailBufferUsd: number;
  minHoldMs: number;
} {
  if (strategy === 'profit_grabber') {
    return { ...HL_AGGRESSIVE_PROFIT_LOCK };
  }
  return { ...HL_STANDARD_PROFIT_LOCK };
}
