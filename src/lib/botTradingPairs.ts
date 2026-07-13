/**
 * Hyperliquid bot scans only liquid HL perps (≥ $5M 24h notional).
 * Manual trading can still use any HL perp — this allowlist is bot-only.
 * Live universe comes from bot-service `/api/global-signals` → `botUniverse`.
 * Fallback list = last known ≥$5M set (updated when liquidity regime shifts).
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
export const BOT_MIN_DAY_VOLUME_USD = 5_000_000;

/**
 * Fallback bot universe when `/api/global-signals` has not returned `botUniverse` yet.
 * Must only contain names that typically clear the $5M floor — never AXS/PAXG/etc.
 */
export const BOT_TRADE_FALLBACK_COINS = [
  'BTC',
  'ETH',
  'HYPE',
  'SOL',
  'ZEC',
  'CASHCAT',
  'LIT',
  'XRP',
  'WLD',
  'FARTCOIN',
  'PUMP',
  'ARB',
  'AAVE',
  'NEAR',
  'UNI',
  'SUI',
  'BNB',
  'ADA',
  'XPL',
] as const;

const BOT_TRADE_FALLBACK_SET = new Set<string>(BOT_TRADE_FALLBACK_COINS);

/** Hard excludes even if volume spikes (mirrors legacy bot-service bans). */
export const BOT_EXCLUDED_HL_COINS = new Set(['CRV']);

export function isBotExcludedHlCoin(coin: string): boolean {
  return BOT_EXCLUDED_HL_COINS.has(normalizeHlPerpCoin(coin));
}

/** Bot-only: coin must be in live allowlist (or fallback) and not hard-excluded. */
export function isBotTradeableHlCoin(
  coin: string,
  liveUniverse?: readonly string[] | null
): boolean {
  const key = normalizeHlPerpCoin(coin);
  if (!key || BOT_EXCLUDED_HL_COINS.has(key)) return false;
  if (liveUniverse && liveUniverse.length > 0) {
    return liveUniverse.some((c) => normalizeHlPerpCoin(c) === key);
  }
  return BOT_TRADE_FALLBACK_SET.has(key);
}
