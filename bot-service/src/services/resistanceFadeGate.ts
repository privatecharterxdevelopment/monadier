/**
 * Resistance open gate — not a blanket "never LONG at R".
 *
 * At range top / R:
 *   Confirmed close *through* zone high → LONG breakout.
 *   Still inside R → never a new LONG (that was LIT: Open L in the R box).
 *   BTC exploding (inflow tape) → wait (don't long the ceiling, don't short the pump).
 *   Coin expanding on volume → wait.
 *   BTC quiet + no volume expansion → SHORT fade (or flip LONG→SHORT).
 */
import { btcIsExploding } from './macroBetaGate';

export type ResistanceFadeVerdict = {
  ok: boolean;
  flipTo?: 'LONG' | 'SHORT';
  reason: string;
};

type CandleLike = {
  open: number;
  close: number;
  volume?: number;
};

/** Real green + volume push — not 8 bps of noise. Same bar as BTC inflow. */
export function isVolumeGreenExpansion(candles: CandleLike[]): boolean {
  if (candles.length < 6) return false;
  const last = candles[candles.length - 1];
  const closed = candles[candles.length - 2];
  const check = (bar: CandleLike | undefined, prior: CandleLike[]): boolean => {
    if (!bar || prior.length < 4) return false;
    const open = Number(bar.open);
    const close = Number(bar.close);
    if (!open || open <= 0 || close <= open) return false;
    const bodyPct = ((close - open) / open) * 100;
    if (bodyPct < 0.2) return false;
    const avgVol = prior.reduce((s, c) => s + (Number(c.volume) || 0), 0) / prior.length;
    const vr = avgVol > 0 ? (Number(bar.volume) || 0) / avgVol : 1;
    return vr >= 1.15;
  };
  const livePrior = candles.slice(Math.max(0, candles.length - 13), candles.length - 1);
  const closedPrior = candles.slice(Math.max(0, candles.length - 14), candles.length - 2);
  return check(last, livePrior) || check(closed, closedPrior);
}

export function evaluateResistanceFade(opts: {
  direction: 'LONG' | 'SHORT';
  atResistance: boolean;
  confirmedBreakoutUp: boolean;
  /** Coin 15m/5m still expanding on volume — do not fade that. */
  coinVolumeExpanding?: boolean;
}): ResistanceFadeVerdict | null {
  if (!opts.atResistance) return null;

  if (opts.confirmedBreakoutUp) {
    if (opts.direction === 'LONG') {
      return { ok: true, reason: 'Resistance breakout confirmed — LONG through R' };
    }
    return {
      ok: true,
      flipTo: 'LONG',
      reason: 'Resistance breakout confirmed — flip SHORT→LONG',
    };
  }

  const btc = btcIsExploding();
  if (btc.yes) {
    // Tagging R during a BTC push is NOT a long. Only a close through R is.
    // Don't short the pump either — wait.
    return {
      ok: false,
      reason: `At R, no close through zone high — wait (${btc.reason})`,
    };
  }

  if (opts.coinVolumeExpanding) {
    return {
      ok: false,
      reason: 'At R but coin expanding on volume — wait (no fade into a live push)',
    };
  }

  if (opts.direction === 'SHORT') {
    return { ok: true, reason: 'SHORT at R — BTC not exploding, fade allowed' };
  }
  return {
    ok: true,
    flipTo: 'SHORT',
    reason: 'R + BTC not exploding — fade SHORT (not a high LONG)',
  };
}
