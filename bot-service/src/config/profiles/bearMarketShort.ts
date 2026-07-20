import {
  type HlDirectionProfile,
  type HlDirectionRules,
} from './types';

/**
 * JUNE 26 – JUL 13 SHORT ENGINE
 * =============================
 * Separate short pack. Switch via `HL_DIRECTION_PROFILE=bear_market`.
 *
 * SHORT = primary (June gate posture: every secondary runs, no LLM, no HTF).
 * LONG  = still allowed when conviction is real (high conf + multi-TF). Not a
 *         hard ban under short logic — only weak / against-trend LONGs stay out.
 */

/** Exact June short open-rule posture — never relax / never bypass secondaries. */
export const JUNE_SHORT_RULES: HlDirectionRules = {
  minConfidence: 55,
  minDirectionalTfs: 2,
  minTrendAlignment: 50,
  requiredH1Trend: null,
  trustMtfScan: true,
  relaxSecondaryGates: false,
  enforceHtfSr: false,
  bypassFreshPumpWhenTrusted: false,
  bypassMacroBetaWhenTrusted: false,
  bypassPumpShortWhenTrusted: false,
  bypassEntryLocationWhenTrusted: false,
};

/**
 * Strong LONGs under a SHORT-primary regime.
 * Example that must pass: NEAR LONG 88% with 5m/15m/1h aligned.
 * No hard "LONG disabled" — confidence + TF alignment decide.
 */
export const STRONG_LONG_UNDER_SHORT: HlDirectionRules = {
  minConfidence: 70,
  minDirectionalTfs: 2,
  minTrendAlignment: 55,
  requiredH1Trend: null,
  trustMtfScan: true,
  relaxSecondaryGates: false,
  enforceHtfSr: false,
  bypassFreshPumpWhenTrusted: true,
  bypassMacroBetaWhenTrusted: true,
  bypassPumpShortWhenTrusted: true,
  bypassEntryLocationWhenTrusted: false,
};

export const BEAR_MARKET: HlDirectionProfile = {
  name: 'bear_market',
  description:
    'June-26→Jul-13 SHORT engine + strong LONGs allowed (high conf / multi-TF). Full SHORT gates, no HTF, no LLM.',
  primaryDirection: 'SHORT',
  analysisTimeframes: ['1m', '5m', '15m', '1h'],
  entryTimeframe: '5m',
  preOpenTimeframe: '1m',
  preOpenCandleCount: 20,
  preOpenMinVolumeRatio: 0.85,
  maxVolumeRank: 18,
  /** 1m/5m scalp confirm — applied to SHORT opens only (see hlTrading). */
  useScalpAlignment: true,
  useAggressiveScalpSignals: true,
  enableHtfSr: false,
  enableLlmConfirm: false,
  short: { ...JUNE_SHORT_RULES },
  long: { ...STRONG_LONG_UNDER_SHORT },
};
