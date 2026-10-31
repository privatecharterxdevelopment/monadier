/**
 * Hard invalidation exits — run BEFORE profitOnlyExits.
 * profitOnlyExits still holds “just red / not green yet”.
 * This module only fires on unambiguous structural or hard-SL breach.
 *
 * Zone rule (adverse to the position — matches flip thesis):
 *   SHORT near/in support zone → exit when bounce confirms (2 closes above zoneHigh).
 *   LONG near/in resistance zone → exit when rejection confirms (2 closes below zoneLow).
 * (“2 closes below zoneLow” on a SHORT would confirm breakdown — that validates SHORT, so it is NOT used as SHORT invalidation.)
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import {
  computeResistanceZone,
  computeSupportZone,
  confirmedBreakAboveZone,
  confirmedBreakBelowZone,
  priceInsideZone,
  type PriceZone,
} from './resistanceZone';

export type InvalidationExitVerdict =
  | { close: false; reason: string }
  | {
      close: true;
      reason: 'invalidation_zone' | 'invalidation_hard_sl';
      detail: string;
    };

function atrUsd(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i += 1) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    sum += tr;
  }
  return sum / period;
}

function nearOrInsideZone(price: number, zone: PriceZone, nearPct: number): boolean {
  if (priceInsideZone(price, zone)) return true;
  const mid = zone.mid;
  if (!(mid > 0)) return false;
  return Math.abs(price - mid) / mid <= nearPct;
}

export async function evaluateInvalidationExit(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  markPx: number;
}): Promise<InvalidationExitVerdict> {
  const cfg = config.hyperliquid.invalidationExit;
  if (!cfg.enabled) {
    return { close: false, reason: 'invalidation exit disabled' };
  }

  const entry = opts.entryPx;
  const mark = opts.markPx;
  if (!(entry > 0) || !(mark > 0)) {
    return { close: false, reason: 'missing entry/mark' };
  }

  const symbol = hlCoinToBinanceSymbol(opts.coin);
  const candles = await signalEngine.fetchCandles(symbol, '5m', cfg.candleLimit);
  if (candles.length < 16) {
    return { close: false, reason: 'insufficient candles for invalidation' };
  }

  const atr = atrUsd(candles, cfg.atrPeriod);
  const pctDist = entry * cfg.hardStopEntryPct;
  const atrDist = atr > 0 ? atr * cfg.hardStopAtrMult : 0;
  // Closer stop wins (fires sooner).
  const stopDist =
    atrDist > 0 && pctDist > 0
      ? Math.min(atrDist, pctDist)
      : Math.max(atrDist, pctDist);

  if (stopDist > 0) {
    if (opts.direction === 'SHORT' && mark >= entry + stopDist) {
      return {
        close: true,
        reason: 'invalidation_hard_sl',
        detail: `HARD SL — SHORT ${opts.coin} mark $${mark.toFixed(4)} ≥ entry $${entry.toFixed(4)} + $${stopDist.toFixed(4)} (ATR/${(cfg.hardStopEntryPct * 100).toFixed(2)}%)`,
      };
    }
    if (opts.direction === 'LONG' && mark <= entry - stopDist) {
      return {
        close: true,
        reason: 'invalidation_hard_sl',
        detail: `HARD SL — LONG ${opts.coin} mark $${mark.toFixed(4)} ≤ entry $${entry.toFixed(4)} − $${stopDist.toFixed(4)} (ATR/${(cfg.hardStopEntryPct * 100).toFixed(2)}%)`,
      };
    }
  }

  const zoneOpts = {
    swingClusterPct: config.hyperliquid.entryLocation.swingClusterPct,
    touchTolerancePct: config.hyperliquid.entryLocation.touchTolerancePct,
  };
  const support = computeSupportZone(candles, zoneOpts);
  const resistance = computeResistanceZone(candles, zoneOpts);
  const bars = cfg.zoneBreakConfirmBars;
  const buf = config.hyperliquid.entryLocation.breakoutBufferPct;

  // SHORT opened / sitting at the floor: bounce through S-zone high invalidates.
  if (opts.direction === 'SHORT' && support) {
    const relevant =
      nearOrInsideZone(entry, support, cfg.nearZonePct) ||
      nearOrInsideZone(mark, support, cfg.nearZonePct);
    if (
      relevant &&
      confirmedBreakAboveZone(candles, support, buf, bars)
    ) {
      return {
        close: true,
        reason: 'invalidation_zone',
        detail: `ZONE INVALIDATION — SHORT ${opts.coin} bounce through S-zone $${support.zoneLow.toFixed(4)}–$${support.zoneHigh.toFixed(4)} (${bars} closes above) — exit regardless of PnL`,
      };
    }
  }

  // LONG opened / sitting at the ceiling: rejection through R-zone low invalidates.
  if (opts.direction === 'LONG' && resistance) {
    const relevant =
      nearOrInsideZone(entry, resistance, cfg.nearZonePct) ||
      nearOrInsideZone(mark, resistance, cfg.nearZonePct);
    if (
      relevant &&
      confirmedBreakBelowZone(candles, resistance, buf, bars)
    ) {
      return {
        close: true,
        reason: 'invalidation_zone',
        detail: `ZONE INVALIDATION — LONG ${opts.coin} rejection through R-zone $${resistance.zoneLow.toFixed(4)}–$${resistance.zoneHigh.toFixed(4)} (${bars} closes below) — exit regardless of PnL`,
      };
    }
  }

  return { close: false, reason: 'no invalidation' };
}
