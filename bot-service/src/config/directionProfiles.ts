import {
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
  type HlLongAnalysisTimeframe,
  type HlProfileDirection,
  type HlProfileTimeframe,
  type HlShortAnalysisTimeframe,
} from './profiles/types';
import { BEAR_MARKET } from './profiles/bearMarketShort';
import { BULL_MARKET } from './profiles/bullMarketLong';

export type {
  HlDirectionProfileName,
  HlProfileDirection,
  HlProfileTimeframe,
  HlPreOpenTimeframe,
  HlDirectionRules,
  HlDirectionProfile,
  HlLongAnalysisTimeframe,
  HlShortAnalysisTimeframe,
} from './profiles/types';

export {
  SHORT_ANALYSIS_TIMEFRAMES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
} from './profiles/types';
export { BEAR_MARKET } from './profiles/bearMarketShort';
export { BULL_MARKET } from './profiles/bullMarketLong';


/** 4h on by default for LONG; set HL_LONG_INCLUDE_4H=false to disable. */
export function longAnalysisTimeframes(): HlLongAnalysisTimeframe[] {
  const include4h = process.env.HL_LONG_INCLUDE_4H !== 'false';
  return include4h
    ? [...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h']
    : [...LONG_ANALYSIS_TIMEFRAMES_BASE];
}

export function shortAnalysisTimeframes(): HlShortAnalysisTimeframe[] {
  return [...SHORT_ANALYSIS_TIMEFRAMES];
}

export function analysisTimeframesForDirection(
  direction: HlProfileDirection
): HlProfileTimeframe[] {
  return direction === 'LONG' ? longAnalysisTimeframes() : shortAnalysisTimeframes();
}

export function unionAnalysisTimeframes(): HlProfileTimeframe[] {
  return [...new Set([...shortAnalysisTimeframes(), ...longAnalysisTimeframes()])];
}

export function entryTimeframeForDirection(
  profile: HlDirectionProfile,
  direction: HlProfileDirection
): '5m' | '15m' {
  return direction === 'LONG' ? profile.entryTimeframeLong : profile.entryTimeframeShort;
}

export function preOpenTimeframeForDirection(
  profile: HlDirectionProfile,
  direction: HlProfileDirection
): '5m' | '15m' {
  return direction === 'LONG' ? profile.preOpenTimeframeLong : profile.preOpenTimeframeShort;
}

/**
 * One-switch market-regime selector (manual override).
 *
 * Prefer HL_DIRECTION_PROFILE=auto (default) — BTC 4h/1h picks bull vs bear live
 * via liveDirectionProfile.refreshLiveDirectionProfile().
 *
 * Forced:
 *   HL_DIRECTION_PROFILE=bull_market  → profiles/bullMarketLong.ts
 *   HL_DIRECTION_PROFILE=bear_market  → profiles/bearMarketShort.ts
 *   aliases: bear | short | short_friendly → bear
 *
 * Analysis TFs are always direction-hardcoded (not flipped by the regime switch):
 *   SHORT → 5m/15m/1h · LONG → 15m/1h/(4h)
 *
 * Switching profiles only affects NEW opens — existing positions keep being
 * managed by the close/trail path regardless of the active profile.
 *
 * Ops: HL_ALLOW_SHORT_OPENS=false / HL_ALLOW_LONG_OPENS=false kill that
 * side at scan+open even if the live profile would allow it.
 */
export function resolveDirectionProfile(raw: string | undefined) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (
    value === 'bear_market' ||
    value === 'bear' ||
    value === 'short' ||
    value === 'short_friendly'
  ) {
    return BEAR_MARKET;
  }
  // auto / btc / empty / bull → caller uses live BTC for auto; this returns bull
  // as the static fallback when forced-bull or unknown.
  return BULL_MARKET;
}
