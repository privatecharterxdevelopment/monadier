/**
 * Shared SHORT breakdown confirmation used by pre-open, location, and HTF quality.
 * Floor tags without a hold-below prior support are not confirmation.
 */
import { analyzeSrZones } from './entryLocationGate';
import {
  confirmedBreakdownThroughPriorSupport,
  isShortDumpContinuation,
} from './shortDumpStructure';
import type { Candle } from './signalEngine';

export function isConfirmedShortBreakdown(opts: {
  candles5m: Candle[];
  candles15m: Candle[];
}): boolean {
  const sr = analyzeSrZones(opts.candles5m, opts.candles15m);
  if (sr.confirmedBreakdown) return true;
  if (isShortDumpContinuation(opts)) return true;
  return confirmedBreakdownThroughPriorSupport(opts.candles15m);
}
