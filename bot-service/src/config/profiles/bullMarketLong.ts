import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * BULL MARKET — LONG-primary with high trade throughput.
 *
 * Goal: many opens, dip-buy LONGs (room up), dump SHORTs allowed,
 * multi-stage profit trail handles exits — stop over-waiting on soft gates/LLM.
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'LONG-primary throughput: dip LONGs + dump SHORTs; no LLM candle waits.',
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
  allowShortOpens: true,
  long: {
    ...PRIMARY_RULES,
    minConfidence: 48,
    minDirectionalTfs: 2,
    minTrendAlignment: 40,
    trustMtfScan: true,
    relaxSecondaryGates: true,
    enforceHtfSr: false,
  },
  short: {
    ...COUNTER_TREND_RULES('DOWN'),
    minConfidence: 62,
    minDirectionalTfs: 2,
    minTrendAlignment: 50,
    relaxSecondaryGates: true,
    trustMtfScan: true,
    bypassPumpShortWhenTrusted: true,
    /** Shadow HTF only — hard enforce starved dump shorts. */
    enforceHtfSr: false,
  },
};
