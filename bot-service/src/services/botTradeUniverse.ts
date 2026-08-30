import { config } from '../config';

/** Bot opens/scans only these names (default BTC/ETH/SOL). */
export function botTradeCoins(): string[] {
  return (config.hyperliquid.botTradeCoins ?? []).map((c) => c.toUpperCase());
}

/**
 * Hard bot universe — bull allowlist / volume top-18 cannot bypass this.
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
