/**
 * Hyperliquid bot scans liquid HL perps (≥ $2.5M 24h notional).
 * Live universe comes from bot-service `/api/global-signals` → `botUniverse`.
 * Fallback list = last known ≥$2.5M set (updated when liquidity regime shifts).
 */
export function hlCoinToBinanceSymbol(coin: string): string {
  const base = coin.toUpperCase().replace(/-PERP$/i, '');
  return `${base}USDT`;
}

/** Binance-style symbol → HL perp coin (e.g. ETHUSDT → ETH). */
export function binanceSymbolToHlCoin(symbol: string): string {
  return symbol.replace(/USDT$/i, '').toUpperCase();
}

/** @deprecated use hlCoinToBinanceSymbol */
export const hlCoinToBotSymbol = hlCoinToBinanceSymbol;

export function pairLabel(binanceSymbol: string): string {
  return binanceSymbol.replace(/USDT$/, '');
}

export function pairLabelFromHlCoin(coin: string): string {
  return normalizeHlPerpCoin(coin);
}

/** Normalize HL perp tickers from positions, clicks, and chart state. */
export function normalizeHlPerpCoin(coin: string): string {
  return coin.trim().toUpperCase().replace(/-PERP$/i, '');
}

/** Keep in sync with bot-service `BOT_MIN_DAY_VOLUME_USD` / `HL_MIN_DAY_VOLUME_USD`. */
export const BOT_MIN_DAY_VOLUME_USD = 2_500_000;

/**
 * Fallback bot universe — majors only (BTC/ETH/SOL).
 * Live list comes from `/api/global-signals` → `botUniverse`.
 */
export const BOT_TRADE_FALLBACK_COINS = ['BTC', 'ETH', 'SOL'] as const;

const BOT_TRADE_FALLBACK_SET = new Set<string>(BOT_TRADE_FALLBACK_COINS);

/**
 * Platform hard-delist — bot never scans/opens; markets ticker / pair picker hide them.
 * Open positions for these still show so the user can Close.
 * Keep in sync with bot-service `excludedCoins` hard bans.
 */
export const BOT_EXCLUDED_HL_COINS = new Set([
  'ZEC',
  'CRV',
  'CASHCAT',
  'PUMP',
  'VVV',
  'WLD',
  'CC',
  'EIGEN',
  'XLM',
  'MON',
  'KAITO',
]);

export function isBotExcludedHlCoin(coin: string): boolean {
  return BOT_EXCLUDED_HL_COINS.has(normalizeHlPerpCoin(coin));
}

/** Alias for market/UI delist checks (same set as bot ban). */
export const isHlPlatformBannedCoin = isBotExcludedHlCoin;

/** Hide from analyzer/scan/ticker — hard ban names + aliases. */
export function isHiddenFromBotUi(coin: string): boolean {
  const key = normalizeHlPerpCoin(coin);
  if (!key) return true;
  if (BOT_EXCLUDED_HL_COINS.has(key)) return true;
  // Catch hyphen/space variants like "CASH CAT"
  const compact = key.replace(/[^A-Z0-9]/g, '');
  return (
    compact === 'CASHCAT' ||
    compact === 'CRV' ||
    compact === 'ZEC' ||
    compact === 'PUMP' ||
    compact === 'VVV' ||
    compact === 'WLD' ||
    compact === 'CC' ||
    compact === 'EIGEN' ||
    compact === 'XLM' ||
    compact === 'MON' ||
    compact === 'KAITO'
  );
}

/** Bot-only: majors (BTC/ETH/SOL), not hard-excluded. Live universe cannot re-add alts. */
export function isBotTradeableHlCoin(
  coin: string,
  liveUniverse?: readonly string[] | null
): boolean {
  const key = normalizeHlPerpCoin(coin);
  if (!key || isHiddenFromBotUi(key)) return false;
  if (!BOT_TRADE_FALLBACK_SET.has(key)) return false;
  if (liveUniverse && liveUniverse.length > 0) {
    return liveUniverse.some((c) => normalizeHlPerpCoin(c) === key);
  }
  return true;
}
