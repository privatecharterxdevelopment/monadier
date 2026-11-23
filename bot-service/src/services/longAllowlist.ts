/**
 * LONG allowlist — BTC/ETH/SOL in bear / default.
 * Bull market: any non-excluded coin may LONG (hard excludes still apply at open).
 * AVA normalizes to AVAX.
 * Override: HL_LONG_ONLY_COINS="*" or "ALL" = unrestricted; "BTC,ETH,SOL" = majors only.
 */
import { config } from '../config';

const MAJOR_LONG_DEFAULT = ['BTC', 'ETH', 'SOL'] as const;

export function normalizeLongCoin(coin: string): string {
  const c = coin.trim().toUpperCase();
  return c === 'AVA' ? 'AVAX' : c;
}

export function longAllowlistCoins(): string[] {
  const fromCfg = config.hyperliquid.longOnlyCoins ?? [];
  if (fromCfg.length > 0) return fromCfg.map(normalizeLongCoin);
  return [...MAJOR_LONG_DEFAULT];
}

function allowlistIsOpen(allow: string[]): boolean {
  if (allow.length === 0) return true;
  return allow.some((c) => c === '*' || c === 'ALL');
}

/** True when this coin may open LONG (bull = all; else allowlist). */
export function isLongAllowedCoin(coin: string): boolean {
  // Bull run: LONG-primary across the book — majors-only ban was a bear/meme patch.
  if (config.hyperliquid.directionProfile.name === 'bull_market') return true;
  const allow = longAllowlistCoins();
  if (allowlistIsOpen(allow)) return true;
  return allow.includes(normalizeLongCoin(coin));
}

export function longAllowlistReason(coin: string): string {
  const allow = longAllowlistCoins();
  if (allowlistIsOpen(allow)) {
    return `LONG blocked — unexpected allowlist miss for ${normalizeLongCoin(coin)}`;
  }
  return `LONG blocked — ${normalizeLongCoin(coin)} not in allowlist (${allow.join(',')}); other memes/alts are SHORT-only`;
}
