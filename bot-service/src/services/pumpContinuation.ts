/**
 * Allow LONG entries at range highs when price is in a live pump / breakout continuation
 * (majors especially — anti-chase gates were blocking ETH longs during rallies).
 */
import { config } from '../config';
import { MAJOR_COINS } from './coinTier';

export type PumpContinuationInput = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  recentMovePct: number;
  netMovePct: number;
  greenCount: number;
  candleCount: number;
  structure: string;
  rangePosition: number;
};

export function isPumpContinuationLong(input: PumpContinuationInput): boolean {
  if (input.direction !== 'LONG') return false;

  const coin = input.coin.toUpperCase();
  const cfg = config.hyperliquid.preOpenCandles;
  const total = Math.max(1, input.candleCount);
  const greenRatio = input.greenCount / total;
  const atHighs = input.rangePosition >= 0.68;
  const strongRecent = input.recentMovePct >= cfg.breakoutRecentMovePct;
  const softRecent = input.recentMovePct >= cfg.breakoutRecentMovePct * 0.5;
  const strongNet = input.netMovePct >= cfg.minNetMovePct * 1.5;
  const bullish =
    input.structure === 'up' ||
    (greenRatio >= 0.55 && input.netMovePct > 0) ||
    strongRecent ||
    strongNet;

  if (!bullish || !atHighs) return false;

  if (MAJOR_COINS.has(coin)) {
    return softRecent || strongNet || input.structure === 'up';
  }

  return strongRecent && input.netMovePct > 0;
}
