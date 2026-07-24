import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * JUNE 26 – JUL 13 SHORT ENGINE (bombastic window)
 * ================================================
 * Switch via `HL_DIRECTION_PROFILE=bear_market`.
 *
 * This restores the Jun 26–Jul 13 open posture that printed SHORTs
 * continuously (`ab956cd` replica), NOT the later "exact pack"
 * (`891056b`) that forced `relaxSecondaryGates: false` and starved opens.
 *
 * SHORT = PRIMARY_RULES — trusted MTF may relax/bypass secondaries so
 *         shorts actually fill when the scan prints them.
 * LONG  = strict counter-trend only (h1 UP, high conf) — not the soft
 *         strong-LONG lane.
 *
 * TF hard rule (always):
 *   SHORT → 1m/5m/15m/1h · LONG → 15m/1h/(4h)
 */
export const BEAR_MARKET: HlDirectionProfile = {
  name: 'bear_market',
  description:
    'SHORT-primary June 26–Jul 13 replica: PRIMARY_RULES (relax secondaries), scalp ON, no HTF, no LLM; LONG only strict counter-trend.',
  primaryDirection: 'SHORT',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '5m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '1m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '1m',
  /** June window used 20×1m pre-open. */
  preOpenCandleCount: 20,
  preOpenMinVolumeRatio: 0.85,
  maxVolumeRank: 18,
  /** 1m/5m scalp confirm — SHORT opens only. */
  useScalpAlignment: true,
  useAggressiveScalpSignals: true,
  enableHtfSr: false,
  enableLlmConfirm: false,
  /** Aggressive SHORT opens — this is what made Jun 26–Jul 13 print. */
  short: { ...PRIMARY_RULES },
  /** LONGs only as strict counter-trend leftovers. */
  long: COUNTER_TREND_RULES('UP'),
};
