/** Binance symbols the Arbitrum bot scans before opening a trade */
export const BOT_ARBITRUM_SYMBOLS = ['ARBUSDT', 'ETHUSDT', 'BTCUSDT'] as const;

export type BotArbitrumSymbol = (typeof BOT_ARBITRUM_SYMBOLS)[number];

export function pairLabel(binanceSymbol: string): string {
  return binanceSymbol.replace('USDT', '');
}

/** Map Hyperliquid perp coin to Binance symbol the GMX bot analyzes. */
export function hlCoinToBotSymbol(coin: string): BotArbitrumSymbol {
  const base = coin.replace(/-PERP$/i, '').toUpperCase();
  const sym = `${base}USDT`;
  if ((BOT_ARBITRUM_SYMBOLS as readonly string[]).includes(sym)) {
    return sym as BotArbitrumSymbol;
  }
  return 'ETHUSDT';
}
