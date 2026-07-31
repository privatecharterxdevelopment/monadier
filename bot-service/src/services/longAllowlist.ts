/**
 * LONG allowlist — BTC/ETH/SOL/AVAX/PUMP. Other memes/alts = SHORT-only.
 * AVA normalizes to AVAX.
 */
import { config } from '../config';

const MAJOR_LONG_DEFAULT = ['BTC', 'ETH', 'SOL', 'AVAX'] as const;

export function normalizeLongCoin(coin: string): string {
  const c = coin.trim().toUpperCase();
  return c === 'AVA' ? 'AVAX' : c;
}

export function longAllowlistCoins(): string[] {
  const fromCfg = config.hyperliquid.longOnlyCoins ?? [];
  if (fromCfg.length > 0) return fromCfg.map(normalizeLongCoin);
  return [...MAJOR_LONG_DEFAULT];
}

/** True for allowlisted LONG coins (default BTC/ETH/SOL/AVAX/PUMP). */
export function isLongAllowedCoin(coin: string): boolean {
  const allow = longAllowlistCoins();
  if (allow.length === 0) return false;
  return allow.includes(normalizeLongCoin(coin));
}

export function longAllowlistReason(coin: string): string {
  const allow = longAllowlistCoins();
  return `LONG blocked — ${normalizeLongCoin(coin)} not in allowlist (${allow.join(',')}); other memes/alts are SHORT-only`;
}
