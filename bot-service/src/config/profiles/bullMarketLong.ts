import {
  COUNTER_TREND_RULES,
  PRIMARY_RULES,
  type HlDirectionProfile,
} from './types';

/**
 * BULL MARKET — LONG-first regime.
 *
 * This is the CURRENT live long logic. Values here MUST mirror the current
 * production config defaults so switching HL_DIRECTION_PROFILE to bull_market
 * (or leaving it as the default) leaves long behavior 100% unchanged:
 *   - maxVolumeRank 60   (current default)
 *   - preOpen 8 candles / 15m  (current defaults)
 *   - 15m/1h analysis, 15m entry grouping, scalp alignment OFF
 *   - HTF S/R gate ON (shadow)
 *
 * LONG = primary (aggressive). SHORT = counter-trend only (strict, h1 DOWN).
 */
export const BULL_MARKET: HlDirectionProfile = {
  name: 'bull_market',
  description:
    'Current live LONG logic: 15m/1h analysis, 15m entry, 8-candle pre-open, wide (60) universe, HTF gate on.',
  primaryDirection: 'LONG',
  analysisTimeframes: ['15m', '1h'],
  entryTimeframe: '15m',
  preOpenTimeframe: '15m',
  preOpenCandleCount: 8,
  preOpenMinVolumeRatio: 0.5,
  maxVolumeRank: 60,
  useScalpAlignment: false,
  useAggressiveScalpSignals: false,
  enableHtfSr: true,
  enableLlmConfirm: true,
  long: { ...PRIMARY_RULES },
  short: COUNTER_TREND_RULES('DOWN'),
};
