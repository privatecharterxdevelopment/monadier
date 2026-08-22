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
 * Goal: dip-buy / continuation LONGs across liquid HL perps; SHORTs when a
 * real dump/breakdown signal prints (never resistance fade, never into green BTC).
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'LONG-primary bull: dip/continuation LONGs; SHORTs when dump/breakdown signals print.',
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
  /** Dump/breakdown SHORTs allowed; LONG stays primary in pickWinner. */
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
    // Real dump/breakdown stack — not a ghost 70% gate. Still H1 DOWN, no R-fade.
    minConfidence: 58,
    minDirectionalTfs: 2,
    minTrendAlignment: 50,
    trustMtfScan: true,
    relaxSecondaryGates: false,
    bypassPumpShortWhenTrusted: false,
    enforceHtfSr: true,
  },
};
