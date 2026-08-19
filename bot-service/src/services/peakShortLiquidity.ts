/**
 * Peak → SHORT liquidity grab.
 *
 * When price is sitting on the pump apex, chasing LONG is wrong — that is the
 * short-liquidity grab zone. This helper forces SHORT (and flips LONG→SHORT)
 * so the regime profile cannot keep the bot long-only into the top.
 */
import {
  fetchPumpSweepAnalysis,
  type PumpSweepAnalysis,
  type PumpSweepPhase,
} from './pumpSweepAnalytics';
import { btcLeadIsPumping, btcTapeIsGreen } from './macroBetaGate';

export function isPeakShortGrabPhase(phase: PumpSweepPhase | string | null | undefined): boolean {
  return phase === 'at_apex';
}

/** Still fading from the high — SHORT remains the regime-correct side. */
export function isPostPeakShortPhase(phase: PumpSweepPhase | string | null | undefined): boolean {
  return phase === 'at_apex' || phase === 'post_pump_fade';
}

export type PeakDirectionResolution = {
  direction: 'LONG' | 'SHORT';
  /** True when a LONG (or flat primary) was forced to SHORT because of the apex. */
  peakLiquidityGrab: boolean;
  analysis: PumpSweepAnalysis | null;
};

/**
 * Resolve trade direction against the pump apex.
 * - at_apex → always SHORT (flip LONG→SHORT)
 * - otherwise → keep the signal direction
 */
export async function resolvePeakAwareDirection(
  coin: string,
  signalDirection: 'LONG' | 'SHORT'
): Promise<PeakDirectionResolution> {
  const analysis = await fetchPumpSweepAnalysis(coin);
  // BTC still inflowing → keep LONG. Apex fade / R-short waits for post_peak.
  if (
    analysis &&
    isPeakShortGrabPhase(analysis.phase) &&
    !btcLeadIsPumping() &&
    !btcTapeIsGreen()
  ) {
    return {
      direction: 'SHORT',
      peakLiquidityGrab: true,
      analysis,
    };
  }
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
