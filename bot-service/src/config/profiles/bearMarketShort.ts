import {
  COUNTER_TREND_RULES,
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
 * LONG  = counter-trend only (strict) — not the soft “strong LONG” lane that
 *         let ETH/ZEC LONGs open during a short regime.
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

export const BEAR_MARKET: HlDirectionProfile = {
  name: 'bear_market',
  description:
    'SHORT-primary June engine: SHORT on 1m/5m/15m/1h; LONG only as strict counter-trend (h1 UP, high conf). Full SHORT gates, no HTF, no LLM.',
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
  /** June posture: LONGs only as strict counter-trend leftovers. */
  long: COUNTER_TREND_RULES('UP'),
};
