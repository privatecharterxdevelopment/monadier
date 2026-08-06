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
 * SHORT analysis: 1m + 5m + 15m + 1h (counter-trend / peak / zone-flip still allowed).
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'LONG-primary: LONG on 15m/1h/(4h), SHORT on 1m/5m/15m/1h. Entry 15m long / 5m short.',
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
  /** Counter-trend / peak / zone shorts allowed in bull. */
  allowShortOpens: true,
  long: { ...PRIMARY_RULES },
  short: COUNTER_TREND_RULES('DOWN'),
};
