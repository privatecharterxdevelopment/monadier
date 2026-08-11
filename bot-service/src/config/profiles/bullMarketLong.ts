import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * BULL MARKET — LONG-first regime (we are still in a bull run).
 *
 * SHORT is counter-trend only: early resistance fade after real rejection.
 * Never late dump shorts, never blind MTF reverse into lows.
 * Shared S/R + pump_sweep still block sell-the-dip; bull raises the bar further.
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
  preOpenMinVolumeRatio: 0.5,
  maxVolumeRank: 60,
  minDayVolumeUsd: 0,
  useScalpAlignment: false,
  useAggressiveScalpSignals: false,
  enableHtfSr: true,
  enableLlmConfirm: true,
  allowLongOpens: true,
  allowShortOpens: true,
  long: { ...PRIMARY_RULES },
  short: {
    ...COUNTER_TREND_RULES('DOWN'),
    /** Stricter than default counter-trend — bull fades must be early + clean. */
    minConfidence: 90,
    minDirectionalTfs: 4,
    minTrendAlignment: 85,
    relaxSecondaryGates: false,
    trustMtfScan: false,
  },
};
