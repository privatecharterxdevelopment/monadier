import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';

/**
 * JUNE 26 – JUL 13 SHORT ENGINE (bombastic window)
 * ================================================
 * Switch via `HL_DIRECTION_PROFILE=bear_market`.
 *
 * SHORT = PRIMARY_RULES — trusted MTF may relax/bypass secondaries.
 * LONG  = strict counter-trend only (h1 UP, high conf).
 *
 * Universe: no top-N rank cap — only drop thin pairs under $250M 24h volume.
 */
export const BEAR_MARKET: HlDirectionProfile = {
  name: 'bear_market',
  description:
    'SHORT-primary June replica: PRIMARY_RULES, no rank cap, $250M/24h volume floor; LONG only strict counter-trend.',
  primaryDirection: 'SHORT',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '5m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '1m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '1m',
  preOpenCandleCount: 20,
  preOpenMinVolumeRatio: 0.85,
  /** 0 = no rank cap — let every liquid pair through. */
  maxVolumeRank: 0,
  /** Shitcoin filter: under $250M 24h notional stays out. */
  minDayVolumeUsd: 250_000_000,
  useScalpAlignment: true,
  useAggressiveScalpSignals: true,
  enableHtfSr: false,
  enableLlmConfirm: false,
  short: { ...PRIMARY_RULES },
  long: COUNTER_TREND_RULES('UP'),
};
