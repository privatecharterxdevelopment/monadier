import { config } from '../config';
import type { GlobalSignalCandidate } from './globalMarketScan';
import { normalizeH1Trend } from './trendOnly';

const MAJOR_COINS = new Set(['BTC', 'ETH']);

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

/** Sat 00:00 UTC → Mon 08:00 UTC — thin liquidity; no alt opens, no new LONGs. */
export function isWeekendThinLiquidityWindow(now = new Date()): boolean {
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  if (utcDay === 6 || utcDay === 0) return true;
  if (utcDay === 1 && utcHour < 8) return true;
  return false;
}

/** Weekend open policy — exported for hard gate at order time. */
export function weekendOpenBlocked(
  coin: string,
  direction: 'LONG' | 'SHORT'
): { blocked: boolean; reason?: string } {
  if (!isWeekendThinLiquidityWindow()) return { blocked: false };
  if (direction === 'LONG') {
    return {
      blocked: true,
      reason: 'Weekend — no new LONG opens (thin liquidity / fake pumps)',
    };
  }
  if (!MAJOR_COINS.has(coin.toUpperCase())) {
    return {
      blocked: true,
      reason: 'Weekend — BTC/ETH SHORT only (no alt perps)',
    };
  }
  return { blocked: false };
}

export { MAJOR_COINS };
