import { config } from '../config';

function normalizeCoin(coin: string): string {
  const key = coin.trim().toUpperCase();
  return key === 'AVA' ? 'AVAX' : key;
}

/** True when the bot may scan / open this coin. Empty set = all listed perps. */
export function isBotTradeCoin(coin: string): boolean {
  const key = normalizeCoin(coin);
  if (!key) return false;
  if (config.hyperliquid.excludedCoins.includes(key)) return false;
  if (config.hyperliquid.botTradeCoins.size === 0) return true;
  return config.hyperliquid.botTradeCoins.has(key);
}

export function botTradeUniverseReason(coin: string): string {
  const key = normalizeCoin(coin);
  return `${key} is not in HL_BOT_TRADE_COINS`;
}
