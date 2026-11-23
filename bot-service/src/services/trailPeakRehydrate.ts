/**
 * After Railway redeploy, in-memory/local trail state may be empty even though the
 * position already ran deep into profit. Reconstruct peak uPnL + favorable extreme
 * from candles so breakeven / peak-floor locks can still arm.
 *
 * CRITICAL: only candles at/after open count. Scanning the full history invents a
 * fake peak above a fresh entry and arms a LONG stop *above* mark (instant sniper).
 */
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import type { DynamicTrailRecord } from './dynamicTrailingStop';
import {
  estimateRoundTripFeesUsd,
  isTrailStopCrossed,
  peakProfitFloorStopPx,
} from './dynamicTrailingStop';

async function fetchCandlesDirect(symbol: string): Promise<Candle[]> {
  // Prefer Hyperliquid — same venue as the perp, works from Railway (Binance often blocked).
  const hlCoin = symbol.replace(/USDT$/i, '').toUpperCase();
  try {
    const now = Date.now();
    const start = now - 96 * 3600_000;
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: { coin: hlCoin, interval: '5m', startTime: start, endTime: now },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data.map((c: { t: number; o: string; h: string; l: string; c: string; v: string }) => ({
        time: Number(c.t),
        open: Number(c.o),
        high: Number(c.h),
        low: Number(c.l),
        close: Number(c.c),
        volume: Number(c.v),
      }));
    }
  } catch {
    /* fall through */
  }

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
    // Only bars since open (+1m slack for candle bucket). Full-history scan invents
    // peaks from before entry and arms LONG stops above live mark.
    const openMs =
      opts.openedAtMs > 0 && opts.openedAtMs <= nowMs + 60_000
        ? opts.openedAtMs
        : nowMs;
    const sinceMs = openMs - 60_000;
    const window = candles.filter((c) => Number.isFinite(c.time) && c.time >= sinceMs);
    if (window.length === 0) {
      logger.info('HL trail peak rehydrate — no candles since open', {
        coin: opts.coin,
        symbol,
        openMs,
        totalCandles: candles.length,
      });
      return existing;
    }

    let bestPnl = 0;
    let favorable = opts.entryPrice;

    for (const c of window) {
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

    // Never invent a peak beyond the live mark on a cold start — mark is the only
    // extreme we know this process has actually seen.
    if (opts.direction === 'LONG') {
      favorable = Math.min(favorable, Math.max(opts.entryPrice, opts.markPrice));
      bestPnl = Math.min(bestPnl, Math.max(0, (favorable - opts.entryPrice) * opts.absSize));
    } else {
      favorable = Math.max(favorable, Math.min(opts.entryPrice, opts.markPrice));
      bestPnl = Math.min(bestPnl, Math.max(0, (opts.entryPrice - favorable) * opts.absSize));
    }

    if (bestPnl <= 0) {
      logger.info('HL trail peak rehydrate — no green extreme since open', {
        coin: opts.coin,
        direction: opts.direction,
        entry: opts.entryPrice,
        candles: window.length,
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
          openedAt: openMs,
          estimatedFeesUsd: feesUsd,
          lastTrailDistancePx: 0,
          timeInProfitMs: 0,
          trailCloseDeferUntil: null,
          trailCloseDeferCount: 0,
        };

    rec.entryPrice = opts.entryPrice;
    rec.highestPnlSinceEntry = Math.max(rec.highestPnlSinceEntry, bestPnl);
    rec.maxRunup = Math.max(rec.maxRunup, bestPnl);
    rec.highestPriceSinceEntry =
      opts.direction === 'LONG'
        ? Math.max(rec.highestPriceSinceEntry, favorable)
        : Math.min(rec.highestPriceSinceEntry, favorable);

    // Restore armed peak-floor stop so a later green bounce can still lock.
    // Never arm a stop that is already crossed — for LONG that means stop above
    // mark (trail must sit *below* the run and follow up).
    if (rec.phase === 'idle') {
      const floor = peakProfitFloorStopPx(
        opts.direction,
        opts.entryPrice,
        opts.absSize,
        bestPnl,
        feesUsd,
        'armed'
      );
      const stop = floor?.px ?? null;

      if (stop == null || isTrailStopCrossed(opts.direction, opts.markPrice, stop)) {
        logger.info('HL trail peak rehydrate — peak kept, stop not armed (already crossed)', {
          coin: opts.coin,
          direction: opts.direction,
          stop: stop?.toFixed(6) ?? '—',
          mark: opts.markPrice.toFixed(6),
          bestPnlUsd: bestPnl.toFixed(4),
        });
        rec.phase = 'idle';
        rec.currentTrailStop = null;
        rec.trailArmedAt = null;
        rec.estimatedFeesUsd = feesUsd;
      } else {
        rec.phase = 'armed';
        rec.trailArmedAt = nowMs;
        rec.currentTrailStop = stop;
        rec.estimatedFeesUsd = feesUsd;
      }
    }

    logger.info('HL trail peak rehydrated from candles', {
      coin: opts.coin,
      direction: opts.direction,
      bestPnlUsd: bestPnl.toFixed(4),
      favorablePx: favorable.toFixed(6),
      phase: rec.phase,
      stop: rec.currentTrailStop?.toFixed(6) ?? '—',
      candles: window.length,
      sinceOpen: true,
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
