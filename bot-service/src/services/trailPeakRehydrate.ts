/**
 * After Railway redeploy, in-memory/local trail state may be empty even though the
 * position already ran deep into profit. Reconstruct peak uPnL + favorable extreme
 * from candles so breakeven / peak-floor locks can still arm.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import type { DynamicTrailRecord } from './dynamicTrailingStop';
import { estimateRoundTripFeesUsd } from './dynamicTrailingStop';

async function fetchCandlesDirect(symbol: string): Promise<Candle[]> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=500`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map((k: unknown[]) => ({
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  } catch {
    return [];
  }
}

export async function rehydrateTrailPeakFromCandles(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  absSize: number;
  markPrice: number;
  notionalUsd: number;
  openedAtMs: number;
  existing: DynamicTrailRecord | null;
}): Promise<DynamicTrailRecord | null> {
  const existing = opts.existing;
  if (
    existing &&
    existing.phase !== 'idle' &&
    existing.highestPnlSinceEntry > 0 &&
    existing.currentTrailStop != null
  ) {
    return existing;
  }
  if (existing && existing.highestPnlSinceEntry > 0) {
    return existing;
  }
  if (!(opts.entryPrice > 0) || !(opts.absSize > 0)) return existing;

  try {
    const symbol = hlCoinToBinanceSymbol(opts.coin);
    let candles = await fetchCandlesDirect(symbol);
    if (candles.length === 0) {
      candles = await signalEngine.fetchCandles(symbol, '5m', 500);
    }
    const nowMs = Date.now();
    // After Railway restart openedAt is often "now" — scan full candle window.
    // Do NOT filter by openedAt (it is wrong after redeploy); use all fetched bars.
    if (candles.length === 0) {
      logger.warn('HL trail peak rehydrate — no candles', { coin: opts.coin, symbol });
      return existing;
    }

    let bestPnl = 0;
    let favorable = opts.entryPrice;

    for (const c of candles) {
      if (opts.direction === 'LONG') {
        favorable = Math.max(favorable, c.high);
        const pnl = (c.high - opts.entryPrice) * opts.absSize;
        if (pnl > bestPnl) bestPnl = pnl;
      } else {
        favorable = Math.min(favorable, c.low);
        const pnl = (opts.entryPrice - c.low) * opts.absSize;
        if (pnl > bestPnl) bestPnl = pnl;
      }
    }

    if (bestPnl <= 0) {
      logger.info('HL trail peak rehydrate — no green extreme in window', {
        coin: opts.coin,
        direction: opts.direction,
        entry: opts.entryPrice,
        candles: candles.length,
      });
      return existing;
    }

    const feesUsd = estimateRoundTripFeesUsd(opts.notionalUsd);
    const rec: DynamicTrailRecord = existing
      ? { ...existing }
      : {
          phase: 'idle',
          direction: opts.direction,
          entryPrice: opts.entryPrice,
          highestPriceSinceEntry: favorable,
          highestPnlSinceEntry: bestPnl,
          currentTrailStop: null,
          trailArmedAt: null,
          profitSinceAt: null,
          maxRunup: bestPnl,
          openedAt: opts.openedAtMs || nowMs,
          estimatedFeesUsd: feesUsd,
          lastTrailDistancePx: 0,
          timeInProfitMs: 0,
          trailCloseDeferUntil: null,
          trailCloseDeferCount: 0,
        };

    rec.highestPnlSinceEntry = Math.max(rec.highestPnlSinceEntry, bestPnl);
    rec.maxRunup = Math.max(rec.maxRunup, bestPnl);
    rec.highestPriceSinceEntry =
      opts.direction === 'LONG'
        ? Math.max(rec.highestPriceSinceEntry, favorable)
        : Math.min(rec.highestPriceSinceEntry, favorable);

    // Restore armed peak-floor stop so a later green bounce can still lock.
    if (rec.phase === 'idle') {
      const dropFrac = Math.min(
        0.95,
        Math.max(0.05, config.hyperliquid.dynamicTrail.profitFloorPeakDropFrac)
      );
      const floorPnl = bestPnl * (1 - dropFrac);
      const move = floorPnl / opts.absSize;
      const floorStop =
        opts.direction === 'LONG' ? opts.entryPrice + move : opts.entryPrice - move;
      const beMove =
        (feesUsd + Math.max(feesUsd * 0.5, opts.entryPrice * opts.absSize * 0.0002)) /
        opts.absSize;
      const beStop =
        opts.direction === 'LONG' ? opts.entryPrice + beMove : opts.entryPrice - beMove;
      const stop =
        opts.direction === 'LONG' ? Math.max(beStop, floorStop) : Math.min(beStop, floorStop);
      rec.phase = 'armed';
      rec.trailArmedAt = nowMs;
      rec.currentTrailStop = stop;
      rec.estimatedFeesUsd = feesUsd;
    }

    logger.info('HL trail peak rehydrated from candles', {
      coin: opts.coin,
      direction: opts.direction,
      bestPnlUsd: bestPnl.toFixed(4),
      favorablePx: favorable.toFixed(6),
      phase: rec.phase,
      stop: rec.currentTrailStop?.toFixed(6) ?? '—',
      candles: candles.length,
    });
    return rec;
  } catch (err) {
    logger.warn('HL trail peak rehydrate failed', {
      coin: opts.coin,
      error: err instanceof Error ? err.message : String(err),
    });
    return existing;
  }
}
