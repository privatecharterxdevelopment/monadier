/**
 * LONG allowlist — majors only. Memes / alts = SHORT-only forever under this gate.
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

/** True only for BTC / ETH / SOL / AVAX (or env override). VVV etc. = false. */
export function isLongAllowedCoin(coin: string): boolean {
  const allow = longAllowlistCoins();
  if (allow.length === 0) return false;
  return allow.includes(normalizeLongCoin(coin));
}

export function longAllowlistReason(coin: string): string {
  const allow = longAllowlistCoins();
  return `LONG blocked — ${normalizeLongCoin(coin)} not in allowlist (${allow.join(',')}); memes/alts are SHORT-only`;
}
