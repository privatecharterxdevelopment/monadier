export type HlDirectionProfileName = 'bear_market' | 'bull_market';
export type HlProfileDirection = 'LONG' | 'SHORT';
export type HlProfileTimeframe = '1m' | '5m' | '15m' | '1h';
export type HlPreOpenTimeframe = '1m' | '5m' | '15m';

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
 * SHORT regime = `bearMarketShort.ts` (June 26–Jul 13 engine).
 * LONG regime  = `bullMarketLong.ts` (current long stack).
 */
export type HlDirectionProfile = {
  name: HlDirectionProfileName;
  description: string;
  primaryDirection: HlProfileDirection;
  /** Timeframes fed to the MTF signal analyzer during the scan. */
  analysisTimeframes: HlProfileTimeframe[];
  /** Timeframe used to group/label the scan entry structure. */
  entryTimeframe: '5m' | '15m';
  /** Structural pre-open micro-check (candle count + timeframe). */
  preOpenTimeframe: HlPreOpenTimeframe;
  preOpenCandleCount: number;
  /**
   * Pre-open volume ratio floor. June short used 0.85; long regime kept later 0.5.
   * Env HL_PRE_OPEN_MIN_VOL_RATIO still wins when set.
   */
  preOpenMinVolumeRatio: number;
  /** Hard universe cap by volume rank for opens. June-26 short regime used 18. */
  maxVolumeRank: number;
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
  bypassMacroBetaWhenTrusted: true,
  bypassPumpShortWhenTrusted: true,
  bypassEntryLocationWhenTrusted: true,
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
