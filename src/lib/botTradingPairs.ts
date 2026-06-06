/** Binance symbols the Arbitrum bot scans before opening a trade */
export const BOT_ARBITRUM_SYMBOLS = ['ARBUSDT', 'ETHUSDT', 'BTCUSDT'] as const;

export type BotArbitrumSymbol = (typeof BOT_ARBITRUM_SYMBOLS)[number];

export function pairLabel(binanceSymbol: string): string {
  return binanceSymbol.replace('USDT', '');
}
