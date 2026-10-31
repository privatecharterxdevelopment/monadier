export const BOT_ARCHITECTURE_TITLE = 'How our Hyperliquid bot trades';

export const BOT_ARCHITECTURE_LEAD =
  'Our bot uses a multi-stage analysis pipeline — not simple single indicators.';

export const BOT_ARCHITECTURE_FEATURES = [
  'Multi-timeframe analysis (1m, 5m, 15m, 1h)',
  'Multiple independent safety and quality checks before each trade',
  'Focus on liquid markets and high-volume coins',
  'Market, momentum, and trend confirmation before entries',
  'Protection against obvious pump and FOMO setups',
  'Intelligent profit management with a dynamic trailing stop',
  'Winners can keep running while profits are secured automatically',
  'Maximum capped number of concurrent positions',
  'Individually configurable risk and leverage per user',
  'Fully automatic execution directly on Hyperliquid',
] as const;

export const BOT_ARCHITECTURE_GOAL =
  'Our goal is not to open as many trades as possible, but to trade only when multiple independent signals align at the same time.';
