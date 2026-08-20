import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * BULL MARKET — LONG-primary, SHORT only as strict counter-trend.
 *
 * Goal: dip-buy / continuation LONGs across liquid HL perps; SHORTs only on
 * high-conviction dumps (not equal-weight with LONGs).
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'LONG-primary bull: dip/continuation LONGs; SHORTs only high-conviction dumps.',
  primaryDirection: 'LONG',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '15m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '15m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '1m',
  preOpenCandleCount: 8,
  preOpenMinVolumeRatio: 0.18,
  maxVolumeRank: 100,
  minDayVolumeUsd: 0,
  useScalpAlignment: false,
  useAggressiveScalpSignals: false,
  enableHtfSr: true,
  /** LLM disagreement waits starved opens — trail manages risk after entry. */
  enableLlmConfirm: false,
  allowLongOpens: true,
  /** Keep true so dump SHORTs exist — bars below make them rare vs LONGs. */
  allowShortOpens: true,
  long: {
    ...PRIMARY_RULES,
    minConfidence: 52,
    minDirectionalTfs: 2,
    minTrendAlignment: 45,
    /** No LONGs while 1h is DOWN — dump = shorts, not dip-buy blind. */
    requiredH1Trend: 'UP',
    trustMtfScan: true,
    relaxSecondaryGates: true,
    enforceHtfSr: false,
  },
  short: {
    ...COUNTER_TREND_RULES('DOWN'),
    // Stay strict — do not relax to LONG-parity bars in a bull run.
    minConfidence: 78,
    minDirectionalTfs: 3,
    minTrendAlignment: 65,
    trustMtfScan: false,
    relaxSecondaryGates: false,
    bypassPumpShortWhenTrusted: false,
    enforceHtfSr: true,
  },
};
