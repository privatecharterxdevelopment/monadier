/**
 * Peak → SHORT liquidity grab — OFF for resistance/apex fades.
 *
 * User rule: no resistance shorts. Apex tagging is the same R-fade that
 * flipped LONGs into user shorts. Keep the MTF signal; dump SHORTs still
 * come from a real SHORT stack + breakdown, not from fading the high.
 */
import { config } from '../config';
import {
  fetchPumpSweepAnalysis,
  type PumpSweepAnalysis,
  type PumpSweepPhase,
} from './pumpSweepAnalytics';

export function isPeakShortGrabPhase(phase: PumpSweepPhase | string | null | undefined): boolean {
  return phase === 'at_apex';
}

/** Still fading from the high — SHORT remains the regime-correct side. */
export function isPostPeakShortPhase(phase: PumpSweepPhase | string | null | undefined): boolean {
  return phase === 'at_apex' || phase === 'post_pump_fade';
}

/** Price is at the pump high or still hugging the top — no new LONGs. */
export function isLongAtPeak(analysis: PumpSweepAnalysis | null | undefined): boolean {
  if (!analysis) return false;
  if (analysis.phase === 'at_apex') return true;
  const cap = config.hyperliquid.pumpSweep.longBlockAbovePosition;
  return analysis.phase === 'post_pump_fade' && analysis.positionInSweep > cap;
}

export type PeakDirectionResolution = {
  direction: 'LONG' | 'SHORT';
  /** True when a LONG (or flat primary) was forced to SHORT because of the apex. */
  peakLiquidityGrab: boolean;
  analysis: PumpSweepAnalysis | null;
};

/**
 * Resolve trade direction against the pump apex.
 * Apex / R-fade no longer flips LONG→SHORT.
 */
export async function resolvePeakAwareDirection(
  coin: string,
  signalDirection: 'LONG' | 'SHORT'
): Promise<PeakDirectionResolution> {
  const analysis = await fetchPumpSweepAnalysis(coin);
  return {
    direction: signalDirection,
    peakLiquidityGrab: false,
    analysis,
  };
}

/** Open-path: allow SHORT even when the active profile is LONG-primary. */
export function isPeakShortOverride(
  direction: 'LONG' | 'SHORT',
  analysis: PumpSweepAnalysis | null | undefined
): boolean {
  return direction === 'SHORT' && !!analysis && isPostPeakShortPhase(analysis.phase);
}
