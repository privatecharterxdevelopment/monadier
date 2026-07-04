import { config } from '../config';
import type { GlobalSignalCandidate } from './globalMarketScan';
import { normalizeH1Trend } from './trendOnly';

const MAJOR_COINS = new Set(['BTC', 'ETH']);

/** Multi-TF scan pick strong enough to bypass macro “wait for BTC+ETH INFLOW” on alt LONGs. */
export function isStrongMtfPick(pick: GlobalSignalCandidate): boolean {
  const trendAlign = pick.trendAlignment ?? 0;
  const conf = pick.confidence;
  const tfs = pick.directionalTfCount ?? 0;
  const coin = pick.coin.toUpperCase();
  if (conf >= 70 && tfs >= 3 && trendAlign >= 70) return true;
  if (conf >= 54 && tfs >= 2 && trendAlign >= 48) return true;
  if (MAJOR_COINS.has(coin) && conf >= 52 && tfs >= 2) return true;
  return false;
}

/** Global scan already aligned 5m/15m/1h — open on that thesis without re-blocking. */
export function trustsScanAnalysis(pick: GlobalSignalCandidate): boolean {
  const tfs = pick.directionalTfCount ?? 0;
  const minTfs = config.hyperliquid.minDirectionalTfs;
  const minConf = config.hyperliquid.minSignalConfidence;
  return (
    (pick.direction === 'LONG' || pick.direction === 'SHORT') &&
    tfs >= minTfs &&
    pick.confidence >= minConf
  );
}

/** MTF vote count only overrides trend-only when direction matches 1h macro trend. */
export function mtfOverridesTrendOnlyFilter(
  direction: 'LONG' | 'SHORT',
  h1Trend: string | undefined | null,
  directionalTfCount: number | undefined
): boolean {
  const tfs = directionalTfCount ?? 0;
  const minTfs = config.hyperliquid.minDirectionalTfs;
  if (tfs < minTfs) return false;

  const h1 = normalizeH1Trend(h1Trend);
  if (direction === 'LONG' && (h1 === 'UP' || h1 === 'SIDEWAYS')) return true;
  if (direction === 'SHORT' && h1 === 'DOWN') return true;
  return false;
}

/** Sat 00:00 UTC → Mon 08:00 UTC — thin liquidity window. */
export function isWeekendThinLiquidityWindow(now = new Date()): boolean {
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  if (utcDay === 6 || utcDay === 0) return true;
  if (utcDay === 1 && utcHour < 8) return true;
  return false;
}

/** Weekend open policy — alt LONGs allowed; alt SHORTs blocked (majors both directions). */
export function weekendOpenBlocked(
  coin: string,
  direction: 'LONG' | 'SHORT'
): { blocked: boolean; reason?: string } {
  if (!isWeekendThinLiquidityWindow()) return { blocked: false };
  if (MAJOR_COINS.has(coin.toUpperCase())) return { blocked: false };
  if (direction === 'LONG') return { blocked: false };
  return {
    blocked: true,
    reason: 'Weekend — alt SHORT blocked (thin liquidity)',
  };
}

export { MAJOR_COINS };
