/**
 * After Railway redeploy, in-memory/local trail state may be empty even though the
 * position already ran deep into profit. Reconstruct peak uPnL + favorable extreme
 * from candles so breakeven / peak-floor locks can still arm.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import type { DynamicTrailRecord } from './dynamicTrailingStop';
import { estimateRoundTripFeesUsd } from './dynamicTrailingStop';

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
    const candles = await signalEngine.fetchCandles(symbol, '5m', 500);
    const nowMs = Date.now();
    // After Railway restart openedAt is often "now" — still scan ~72h so we don't
    // forget a real peak from earlier in the position's life.
    const ageGuess = nowMs - (opts.openedAtMs || nowMs);
    const lookbackMs = 72 * 3600_000;
    const since =
      ageGuess < 10 * 60_000
        ? nowMs - lookbackMs
        : Math.max(0, opts.openedAtMs - 5 * 60_000);
    const relevant = candles.filter((c) => c.time >= since);
    if (relevant.length === 0) return existing;

    let bestPnl = 0;
    let favorable =
      existing?.highestPriceSinceEntry ??
      (opts.direction === 'LONG' ? opts.entryPrice : opts.entryPrice);

    for (const c of relevant) {
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

    if (bestPnl <= 0) return existing;

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

    // If peak was big enough to arm, restore armed BE/peak-floor stop immediately
    // so givebacks after redeploy still lock (while still green).
    const armRoe = config.hyperliquid.dynamicTrail.breakevenArmRoePct;
    const collateralGuess = opts.notionalUsd > 0 ? opts.notionalUsd / 10 : 0;
    // Use peak vs a conservative collateral: ROE check uses live collateral in trail tick;
    // here we only decide whether to restore an armed stop from reconstructed peak.
    const peakEnough =
      armRoe <= 0 ||
      collateralGuess <= 0 ||
      (bestPnl / Math.max(collateralGuess, 1)) * 100 >= armRoe * 0.5;

    if (peakEnough && rec.phase === 'idle') {
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
