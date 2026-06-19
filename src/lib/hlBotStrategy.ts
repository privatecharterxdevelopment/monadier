export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF trend scan. SL −% cuts losses; profit lock + trail when in profit; optional TP %.',
  profit_grabber:
    'Aggressive: last 6×1m candles → predict next 3; 5m trend must confirm UP/DOWN (no chop). Trail exit +$0.01 from +$0.02.',
};

export const HL_AGGRESSIVE_PROFIT_LOCK = {
  activateUsd: 0.02,
  floorUsd: 0.01,
} as const;

export function normalizeHlBotStrategy(raw: string | null | undefined): HlBotStrategy {
  if (raw === 'profit_grabber') return 'profit_grabber';
  return 'standard';
}

export function profitLockDisplayForStrategy(strategy: HlBotStrategy): {
  activateUsd: number;
  floorUsd: number;
} {
  if (strategy === 'profit_grabber') {
    return {
      activateUsd: HL_AGGRESSIVE_PROFIT_LOCK.activateUsd,
      floorUsd: HL_AGGRESSIVE_PROFIT_LOCK.floorUsd,
    };
  }
  return { activateUsd: 0.06, floorUsd: 0.03 };
}
