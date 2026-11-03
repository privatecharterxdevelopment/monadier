import { config } from '../config';

export const DEFAULT_BOT_TRADE_COINS = [
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
  'HYPE',
] as const;

/** Explicit allowlist. Empty = all listed HL perps except hard-delist. */
export function botTradeCoins(): string[] {
  return (config.hyperliquid.botTradeCoins ?? []).map((c) => c.toUpperCase());
}

export function botTradeUniverseLabel(): string {
  const coins = botTradeCoins();
  return coins.length > 0 ? coins.join('/') : 'ALL';
}

/**
 * Hard bot universe. Empty allowlist = every non-excluded listed perp (21 Aug).
 * Existing opens on excluded coins are still monitored; no new entries.
 */
export function isBotTradeCoin(coin: string): boolean {
  const key = coin.trim().toUpperCase().replace(/-PERP$/i, '');
  if (!key) return false;
  if (config.hyperliquid.excludedCoins.includes(key)) return false;
  const allow = botTradeCoins();
  if (allow.length === 0) return true;
  return allow.includes(key);
}
