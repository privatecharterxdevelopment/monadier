/**
 * Hyperliquid bot scans all tradable HL perps (from meta API), not a fixed Arbitrum token list.
 * OHLCV for signals uses Binance symbols derived from HL coin names.
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
