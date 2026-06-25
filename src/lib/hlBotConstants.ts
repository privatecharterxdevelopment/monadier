/** Keep in sync with bot-service global scan defaults. */
export const HL_MAX_CONCURRENT_POSITIONS = 2;
export const HL_MIN_SIGNAL_CONFIDENCE = 55;
export const HL_MIN_TREND_ALIGNMENT = 50;
export const HL_MIN_DIRECTIONAL_TFS = 2;

/** Top HL perps by volume — UI rotation when global scan list not loaded yet. */
export const HL_SCAN_UNIVERSE_SIZE = 18;
export const HL_SCAN_ROTATION_COINS = [
  'BTC', 'ETH', 'SOL', 'HYPE', 'DOGE', 'XRP', 'AVAX', 'LINK',
  'ARB', 'OP', 'WIF', 'SUI', 'APT', 'NEAR', 'FIL', 'TIA', 'INJ', 'SEI',
] as const;

/** Bot trading cycle interval — keep in sync with bot-service TRADE_INTERVAL_MS default. */
export const HL_BOT_CYCLE_SEC = 1;

/** Keep in sync with bot-service `HL_DEFAULT_STOP_LOSS_PERCENT` / config defaultStopLossPercent. */
export const HL_DEFAULT_STOP_LOSS_PERCENT = 4;
