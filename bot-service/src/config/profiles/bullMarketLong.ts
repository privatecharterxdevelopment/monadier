import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * BULL MARKET — 21 Aug 2026 winning book: LONG-only, 52% / 2 TFs.
 * SHORTs stay off (12 Aug SHORT-continuation printed FIL bottoms).
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'LONG-only bull (21 Aug): dip/continuation LONGs across liquid HL perps. No new SHORTs.',
  primaryDirection: 'LONG',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '15m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '15m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '15m',
  preOpenCandleCount: 8,
  preOpenMinVolumeRatio: 0.18,
  maxVolumeRank: 100,
  minDayVolumeUsd: 0,
  useScalpAlignment: false,
  useAggressiveScalpSignals: false,
  enableHtfSr: true,
  /** Vision logs in shadow; never fail-closed (Aug 21 traded without vision starve). */
  enableLlmConfirm: true,
  allowLongOpens: true,
  /** 21 Aug ROOT: bull never opens SHORT. */
  allowShortOpens: false,
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
    // Stricter than LONG, not a ghost gate: dump stack + 1h DOWN. No R-fade.
    minConfidence: 70,
    minDirectionalTfs: 2,
    minTrendAlignment: 58,
    trustMtfScan: false,
    relaxSecondaryGates: false,
    bypassPumpShortWhenTrusted: false,
    enforceHtfSr: true,
  },
};
