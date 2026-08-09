import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * BULL MARKET — LONG-first regime.
 *
 * LONG analysis: 15m + 1h (+ optional 4h at runtime).
 * SHORT still allowed, but counter-trend-strict: high conf, 1h DOWN,
 * zone-flip LONG→SHORT only at real upper-range fades (see entryLocation + hlTrading).
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'LONG-primary; SHORT only as strict counter-trend (high conf, 1h DOWN, no lazy zone fades).',
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
  /** Shorts allowed — but stricter than bear primary (see short rules + zone-flip gates). */
  allowShortOpens: true,
  long: { ...PRIMARY_RULES },
  short: {
    ...COUNTER_TREND_RULES('DOWN'),
    /** Was 80 — bull fades need clearer conviction. */
    minConfidence: 85,
    minTrendAlignment: 75,
  },
};
