export type HlDirectionProfileName = 'bear_market' | 'bull_market';
export type HlProfileDirection = 'LONG' | 'SHORT';
/** SHORT stack. */
export type HlShortAnalysisTimeframe = '1m' | '5m' | '15m' | '1h';
/** LONG stack (4h optional via HL_LONG_INCLUDE_4H). */
export type HlLongAnalysisTimeframe = '15m' | '1h' | '4h';
export type HlProfileTimeframe = HlShortAnalysisTimeframe | HlLongAnalysisTimeframe;
export type HlPreOpenTimeframe = '1m' | '5m' | '15m';

/**
 * Hard rule (user):
 *   bear / down / SHORT → 1m, 5m, 15m, 1h
 *   bull / up / LONG    → 15m, 1h, (+4h optional)
 */
export const SHORT_ANALYSIS_TIMEFRAMES: HlShortAnalysisTimeframe[] = [
  '1m',
  '5m',
  '15m',
  '1h',
];
export const LONG_ANALYSIS_TIMEFRAMES_BASE: Array<'15m' | '1h'> = ['15m', '1h'];

/**
 * Per-direction gate rules. `PRIMARY` = the direction this profile is built to
 * trade aggressively; `COUNTER_TREND` = the opposite direction, only allowed
 * under strict, high-conviction conditions.
 */
export type HlDirectionRules = {
  minConfidence: number;
  minDirectionalTfs: number;
  minTrendAlignment: number;
  requiredH1Trend: 'UP' | 'DOWN' | null;
  /**
   * Optional 5m trend gate (LONG only). If 5m is DOWN → no LONG.
   * Unset on SHORT / shared rules — SHORT paths stay unchanged.
   */
  required5mTrend?: 'UP' | 'DOWN' | null;
  /**
   * Optional 15m trend gate (bear_market LONG counter-trend).
   * Unset on PRIMARY / shared COUNTER_TREND — SHORT paths stay unchanged.
   */
  required15mTrend?: 'UP' | 'DOWN' | null;
  /**
   * Closed 15m candles that must confirm required15mTrend (bullish/bearish bodies).
   * 0 / unset = no candle-count gate.
   */
  minConfirm15mCandles?: number;
  trustMtfScan: boolean;
  relaxSecondaryGates: boolean;
  enforceHtfSr: boolean;
  bypassFreshPumpWhenTrusted: boolean;
  bypassMacroBetaWhenTrusted: boolean;
  bypassPumpShortWhenTrusted: boolean;
  bypassEntryLocationWhenTrusted: boolean;
};

/**
 * A full market-regime profile. Selected by the single `HL_DIRECTION_PROFILE`
 * env var. Only ONE profile is ever active per process, so global config values
 * (maxVolumeRank, preOpenCandles) can safely read from the active profile.
 *
 * Analysis TFs are direction-hardcoded (not regime-soft):
 *   SHORT → 1m/5m/15m/1h · LONG → 15m/1h/(4h)
 */
export type HlDirectionProfile = {
  name: HlDirectionProfileName;
  description: string;
  primaryDirection: HlProfileDirection;
  /**
   * @deprecated Prefer direction-specific helpers. Kept as the union of
   * long+short TFs for health / legacy callers.
   */
  analysisTimeframes: HlProfileTimeframe[];
  /** Timeframe used to group/label the scan entry structure (primary side). */
  entryTimeframe: '5m' | '15m';
  entryTimeframeLong: '15m';
  entryTimeframeShort: '5m';
  /** Structural pre-open micro-check (candle count + timeframe). */
  preOpenTimeframe: HlPreOpenTimeframe;
  preOpenTimeframeLong: '15m';
  preOpenTimeframeShort: '1m';
  preOpenCandleCount: number;
  /**
   * Pre-open volume ratio floor. June short used 0.85; long regime kept later 0.5.
   * Env HL_PRE_OPEN_MIN_VOL_RATIO still wins when set.
   */
  preOpenMinVolumeRatio: number;
  /**
   * Hard universe cap by volume rank for opens.
   * 0 = no rank cap (volume floor alone filters thin pairs).
   */
  maxVolumeRank: number;
  /**
   * Optional 24h notional floor for opens (USD).
   * When set (>0) and env HL_MIN_DAY_VOLUME_USD is unset, this profile floor applies.
   * 0 = defer to global config / env only.
   */
  minDayVolumeUsd: number;
  /**
   * June-26 short regime: 1m/5m scalp alignment for SHORT opens.
   * LONGs never use this gate (MTF structure), even under bear_market.
   * Bull long regime keeps this false entirely.
   */
  useScalpAlignment: boolean;
  useAggressiveScalpSignals: boolean;
  /** Post-June gate. Off in the June short replica, on (shadow) in long regime. */
  enableHtfSr: boolean;
  /**
   * Gemini / LLM pre-trade confirm. Off for June short replica (did not exist);
   * on for long regime when HL_LLM_GATE_ENABLED is not false.
   */
  enableLlmConfirm: boolean;
  long: HlDirectionRules;
  short: HlDirectionRules;
};

/** Aggressive rules for the direction the profile is built to trade. */
export const PRIMARY_RULES: HlDirectionRules = {
  minConfidence: 55,
  minDirectionalTfs: 2,
  minTrendAlignment: 50,
  requiredH1Trend: null,
  trustMtfScan: true,
  relaxSecondaryGates: true,
  enforceHtfSr: false,
  bypassFreshPumpWhenTrusted: true,
  bypassMacroBetaWhenTrusted: false,
  bypassPumpShortWhenTrusted: true,
  /** Never skip S/R — trusted SHORTs still must not sell support / range bottom. */
  bypassEntryLocationWhenTrusted: false,
};

/** Strict rules for the counter-trend direction (only high-conviction setups). */
export const COUNTER_TREND_RULES = (
  requiredH1Trend: 'UP' | 'DOWN'
): HlDirectionRules => ({
  minConfidence: 80,
  minDirectionalTfs: 3,
  minTrendAlignment: 65,
  requiredH1Trend,
  trustMtfScan: false,
  relaxSecondaryGates: false,
  enforceHtfSr: true,
  bypassFreshPumpWhenTrusted: false,
  bypassMacroBetaWhenTrusted: false,
  bypassPumpShortWhenTrusted: false,
  bypassEntryLocationWhenTrusted: false,
});
