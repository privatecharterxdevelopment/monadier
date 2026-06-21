export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF trend scan on liquid HL pairs. After 60s green, trails SL into profit — lets winners run.',
  profit_grabber:
    'Aggressive: 6×1m → next 3 with 5m confirm. Same 60s green hold, slightly tighter trail.',
};

/** Must match bot-service resolveHlExitPolicy. */
export const HL_AGGRESSIVE_PROFIT_LOCK = {
  activateUsd: 0.06,
  floorUsd: 0.015,
  trailBufferUsd: 0.035,
  minHoldMs: 60_000,
} as const;

export const HL_STANDARD_PROFIT_LOCK = {
  activateUsd: 0.08,
  floorUsd: 0.02,
  trailBufferUsd: 0.045,
  minHoldMs: 60_000,
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
