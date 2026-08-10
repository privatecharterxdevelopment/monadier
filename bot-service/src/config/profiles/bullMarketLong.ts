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
    'LONG-primary; SHORT allowed on strong MTF dumps (continuation OK — not only R-fades).',
  primaryDirection: 'LONG',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '15m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '15m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '1m',
  preOpenCandleCount: 8,
  /** Was 0.5 — quiet-hour majors (0.17–0.37×) were starving every SHORT. */
  preOpenMinVolumeRatio: 0.18,
  /** Was 60 — liquid mid-caps at rank 62 got killed for no reason. */
  maxVolumeRank: 100,
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
    minConfidence: 70,
    minDirectionalTfs: 2,
    minTrendAlignment: 60,
    /** Strong MTF SHORT skips volume-fade / perp sell-low secondaries. */
    relaxSecondaryGates: true,
    trustMtfScan: true,
  },
};
