import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * BULL MARKET — LONG-first regime (full long focus).
 *
 * SHORT is counter-trend only: early resistance fade after real rejection.
 * Never late dump shorts / blind MTF reverse into lows.
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'LONG-primary bull run; SHORT only early R-fade (strict — no late dump reverses).',
  primaryDirection: 'LONG',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '15m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '15m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '1m',
  preOpenCandleCount: 8,
  preOpenMinVolumeRatio: 0.35,
  maxVolumeRank: 80,
  minDayVolumeUsd: 0,
  useScalpAlignment: false,
  useAggressiveScalpSignals: false,
  enableHtfSr: true,
  enableLlmConfirm: true,
  allowLongOpens: true,
  allowShortOpens: true,
  long: {
    ...PRIMARY_RULES,
    /** Full long focus under bull — slightly lower bar than shared PRIMARY. */
    minConfidence: 50,
    minDirectionalTfs: 2,
    minTrendAlignment: 45,
    trustMtfScan: true,
    relaxSecondaryGates: true,
    enforceHtfSr: false,
  },
  short: {
    ...COUNTER_TREND_RULES('DOWN'),
    /** Strict — bull fades must be early + clean. */
    minConfidence: 85,
    minDirectionalTfs: 3,
    minTrendAlignment: 75,
    relaxSecondaryGates: false,
    trustMtfScan: false,
    bypassPumpShortWhenTrusted: false,
    enforceHtfSr: true,
  },
};
