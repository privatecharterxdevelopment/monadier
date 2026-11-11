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

function normalizeCoinKey(coin: string): string {
  return coin.trim().toUpperCase().replace(/-PERP$/i, '');
}

function compactCoinKey(coin: string): string {
  return normalizeCoinKey(coin).replace(/[^A-Z0-9]/g, '');
}

/** Hard delist — never scan or open. Open books on these coins are still monitored. */
export function isExcludedHlCoin(coin: string): boolean {
  const key = normalizeCoinKey(coin);
  if (!key) return true;
  const compact = compactCoinKey(key);
  return config.hyperliquid.excludedCoins.some((raw) => {
    const ex = normalizeCoinKey(raw);
    return ex === key || compactCoinKey(ex) === compact;
  });
}

/**
 * Hard bot universe. Empty allowlist = every non-excluded listed perp (21 Aug).
 * Existing opens on excluded coins are still monitored; no new entries.
 */
export function isBotTradeCoin(coin: string): boolean {
  const key = normalizeCoinKey(coin);
  if (!key) return false;
  if (isExcludedHlCoin(key)) return false;
  const allow = botTradeCoins();
  if (allow.length === 0) return true;
  return allow.includes(key);
}
