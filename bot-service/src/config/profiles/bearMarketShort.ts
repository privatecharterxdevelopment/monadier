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
 * SHORT = PRIMARY_RULES — trusted MTF may relax chop/funding secondaries,
 *         but NEVER skips entry_location / pump_sweep (no shorting lows).
 * LONG  = majors only: BTC/ETH/SOL/AVAX via longAllowlist (allowLongOpens=true).
 *         Memes (VVV, …) = SHORT-only. Entry: LONG at support / lower range, not at R.
 *
 * Universe: no top-N rank cap. $5M/24h floor filters thin shitcoins while
 * leaving mid-caps (PUMP, WLD, …) tradable — $250M was BTC/ETH-only and starved opens.
 */
export const BEAR_MARKET: HlDirectionProfile = {
  name: 'bear_market',
  description:
    'SHORT-primary; LONG allowlist BTC/ETH/SOL/AVAX (allowLongOpens=true). Memes SHORT-only.',
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
  /** Shitcoin filter — ~top liquid mid-caps; anti-starvation clamp keeps ≥40 tradable. */
  minDayVolumeUsd: 5_000_000,
  useScalpAlignment: true,
  useAggressiveScalpSignals: true,
  enableHtfSr: false,
  enableLlmConfirm: false,
  /** LONGs on — majors only via longAllowlist; memes never. */
  allowLongOpens: true,
  short: { ...PRIMARY_RULES },
  long: {
    ...COUNTER_TREND_RULES('UP'),
    minConfidence: 80,
    requiredH1Trend: 'UP',
    required5mTrend: 'UP',
    required15mTrend: 'UP',
    minConfirm15mCandles: 2,
  },
};
