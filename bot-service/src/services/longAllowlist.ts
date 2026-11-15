/**
 * LONG allowlist — deprecated as an entry blocker.
 * All bot-universe coins may be evaluated for LONG and SHORT; excluded coins still
 * block at `isExcludedHlCoin` / `isBotTradeCoin`. HL_LONG_ONLY_COINS is kept for
 * ops logging only (set "*" or "ALL" for unrestricted metadata).
 */
import { config } from '../config';
import { isBotTradeCoin } from './botTradeUniverse';

const MAJOR_LONG_DEFAULT = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'HYPE'] as const;

export function normalizeLongCoin(coin: string): string {
  const c = coin.trim().toUpperCase();
  return c === 'AVA' ? 'AVAX' : c;
}

export function longAllowlistCoins(): string[] {
  const fromCfg = config.hyperliquid.longOnlyCoins ?? [];
  if (fromCfg.length > 0) return fromCfg.map(normalizeLongCoin);
  return [...MAJOR_LONG_DEFAULT];
}

/** True when this coin may open LONG (bot universe; no majors-only gate). */
export function isLongAllowedCoin(coin: string): boolean {
  const c = normalizeLongCoin(coin);
  if (!isBotTradeCoin(c)) return false;
  return true;
}

export function longAllowlistReason(coin: string): string {
  return `LONG blocked — ${normalizeLongCoin(coin)} not tradable on bot universe`;
}