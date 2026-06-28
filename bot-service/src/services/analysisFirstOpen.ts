import { config } from '../config';
import type { GlobalSignalCandidate } from './globalMarketScan';

const MAJOR_COINS = new Set(['BTC', 'ETH']);

/** Global scan already aligned 5m/15m/1h — open on that thesis without re-blocking SHORT. */
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

export function mtfOverridesTrendOnlyFilter(
  direction: 'LONG' | 'SHORT',
  h1Trend: string | undefined | null,
  directionalTfCount: number | undefined
): boolean {
  const tfs = directionalTfCount ?? 0;
  if (tfs >= config.hyperliquid.minDirectionalTfs) return true;
  const h1 = String(h1Trend ?? 'SIDEWAYS').toUpperCase();
  if (direction === 'LONG') return h1.includes('UP');
  if (direction === 'SHORT') return h1.includes('DOWN');
  return false;
}

export function isWeekendThinLiquidityWindow(now = new Date()): boolean {
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  if (utcDay === 0 && utcHour >= 15) return true;
  if (utcDay === 1 && utcHour < 8) return true;
  if (utcDay === 6 && utcHour >= 20) return true;
  return false;
}

export { MAJOR_COINS };
