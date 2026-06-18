/** Map Hyperliquid perp coin → Binance spot symbol for OHLCV / MTF signals. */
const HL_TO_BINANCE: Record<string, string> = {
  // HL name differs from Binance listing
  MATIC: 'POLUSDT',
};

export function hlCoinToBinanceSymbol(coin: string): string {
  const base = coin.toUpperCase().replace(/-PERP$/i, '');
  return HL_TO_BINANCE[base] ?? `${base}USDT`;
}

export function binanceSymbolToHlCoin(symbol: string): string {
  const upper = symbol.toUpperCase();
  for (const [hl, binance] of Object.entries(HL_TO_BINANCE)) {
    if (binance === upper) return hl;
  }
  return upper.replace(/USDT$/, '');
}
