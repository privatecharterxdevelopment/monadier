import {
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  SHORT_ANALYSIS_TIMEFRAMES,
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
 *
 * TF hard rule (always):
 *   SHORT → 1m/5m/15m/1h · LONG → 15m/1h/(4h)
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
 * Example that must pass: NEAR LONG 88% with 15m/1h aligned (no 1m/5m votes).
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
    'SHORT-primary June engine: SHORT on 1m/5m/15m/1h, LONG on 15m/1h/(4h). Full SHORT gates, no HTF, no LLM.',
  primaryDirection: 'SHORT',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '5m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '1m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '1m',
  preOpenCandleCount: 10,
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
