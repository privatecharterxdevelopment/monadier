import { BOT_TRADE_FALLBACK_COINS } from './botTradingPairs';

/** Platform ceiling (users pick 2 or 3 in bot settings). Keep in sync with bot-service. */
export const HL_MAX_CONCURRENT_POSITIONS = 3;
/** Default when vault_settings has no preference yet. */
export const HL_DEFAULT_CONCURRENT_POSITIONS = 2;
export const HL_MIN_SIGNAL_CONFIDENCE = 52;
export const HL_MIN_TREND_ALIGNMENT = 50;
export const HL_MIN_DIRECTIONAL_TFS = 2;
export const HL_STANDARD_MTF_COUNT = 3;
export const HL_STANDARD_MTF_TIMEFRAMES = ['5m', '15m', '1h'] as const;

/** Bot analyzer rotation — only ≥$5M 24h volume coins (fallback until live botUniverse loads). */
export const HL_SCAN_UNIVERSE_SIZE = BOT_TRADE_FALLBACK_COINS.length;
export const HL_SCAN_ROTATION_COINS = BOT_TRADE_FALLBACK_COINS;

/** Bot trading cycle interval — keep in sync with bot-service TRADE_INTERVAL_MS default. */
export const HL_BOT_CYCLE_SEC = 1;

/** Keep in sync with bot-service `HL_DEFAULT_STOP_LOSS_PERCENT` / config defaultStopLossPercent. */
export const HL_DEFAULT_STOP_LOSS_PERCENT = 0;
