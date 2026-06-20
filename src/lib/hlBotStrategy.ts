export type HlBotStrategy = 'standard' | 'profit_grabber';

/** DB value stays `profit_grabber` — UI label is Aggressive. */
export const HL_BOT_STRATEGY_LABELS: Record<HlBotStrategy, string> = {
  standard: 'Standard',
  profit_grabber: 'Aggressive',
};

export const HL_BOT_STRATEGY_HINTS: Record<HlBotStrategy, string> = {
  standard:
    'Standard: MTF trend scan on liquid HL pairs. Bot trails stop into profit automatically.',
  profit_grabber:
    'Aggressive: 6×1m → next 3 with 5m confirm. Tighter profit trail — bot manages exit.',
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
