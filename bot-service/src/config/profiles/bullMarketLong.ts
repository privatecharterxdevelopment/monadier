import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * BULL MARKET — LONG-primary (yesterday-evening shoot), SHORTs when dump prints.
 *
 * LONGs fire on the MTF stack. SHORTs fire on dump/breakdown *or* range-top.
 * BTC inflow still blocks new shorts. Not a LONG-only book.
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'LONG-primary: continuation LONGs shoot; SHORTs at dump/breakdown or range top (not BTC inflow).',
  primaryDirection: 'LONG',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '15m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '15m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '5m',
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
    minConfidence: 52,
    minDirectionalTfs: 2,
    minTrendAlignment: 45,
    /** Shoot LONGs on the stack — 1h DOWN still goes to shorts, not a hard UP gate. */
    requiredH1Trend: null,
    trustMtfScan: true,
    relaxSecondaryGates: true,
    enforceHtfSr: false,
  },
  short: {
    ...COUNTER_TREND_RULES('DOWN'),
    minConfidence: 55,
    minDirectionalTfs: 2,
    minTrendAlignment: 48,
    requiredH1Trend: null,
    trustMtfScan: true,
    relaxSecondaryGates: false,
    bypassPumpShortWhenTrusted: false,
    enforceHtfSr: true,
  },
};
