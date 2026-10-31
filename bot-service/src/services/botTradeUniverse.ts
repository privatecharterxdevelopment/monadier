import { config } from '../config';

export const DEFAULT_BOT_TRADE_COINS = [
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
  'HYPE',
] as const;

/** Bot opens/scans only these names (liquid majors — no memes). */
export function botTradeCoins(): string[] {
  return (config.hyperliquid.botTradeCoins ?? []).map((c) => c.toUpperCase());
}

export function botTradeUniverseLabel(): string {
  const coins = botTradeCoins();
  return coins.length > 0 ? coins.join('/') : DEFAULT_BOT_TRADE_COINS.join('/');
}

/**
 * Hard bot universe — volume top-N / bull allowlist cannot bypass this.
 * Existing opens on other coins are still monitored; no new entries.
 */
export function isBotTradeCoin(coin: string): boolean {
  const key = coin.trim().toUpperCase().replace(/-PERP$/i, '');
  if (!key) return false;
  if (config.hyperliquid.excludedCoins.includes(key)) return false;
  const allow = botTradeCoins();
  if (allow.length === 0) return false;
  return allow.includes(key);
}
