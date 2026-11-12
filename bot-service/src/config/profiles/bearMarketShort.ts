import {
  COUNTER_TREND_RULES,
  LONG_ANALYSIS_TIMEFRAMES_BASE,
  PRIMARY_RULES,
  SHORT_ANALYSIS_TIMEFRAMES,
  type HlDirectionProfile,
} from './types';
import { BEAR_REVERSAL_LONG } from './bearReversalLong';

/**
 * JUNE 26 – JUL 13 SHORT ENGINE (bombastic window)
 * ================================================
 * Switch via `HL_DIRECTION_PROFILE=bear_market`.
 *
 * SHORT = PRIMARY plus thorough pre-open: 1h+15m DOWN, 3 closed 15m reds,
 *         no trusted-MTF bypass of location / pump / macro. Quality over churn.
 * LONG  = allowlist BTC/ETH/SOL via longAllowlist (allowLongOpens=true).
 *         PUMP/VVV/WLD hard-excluded. Other memes SHORT-only if not excluded.
 *         Entry: LONG at support / lower range, not at R.
 *
 * Universe: no top-N rank cap. $5M/24h floor filters thin shitcoins while
 * leaving mid-caps tradable — $250M was BTC/ETH-only and starved opens.
 */
export const BEAR_MARKET: HlDirectionProfile = {
  name: 'bear_market',
  description:
    'SHORT-primary; LONG allowlist BTC/ETH/SOL. PUMP/VVV/WLD hard-excluded.',
  primaryDirection: 'SHORT',
  analysisTimeframes: [...SHORT_ANALYSIS_TIMEFRAMES, ...LONG_ANALYSIS_TIMEFRAMES_BASE, '4h'],
  entryTimeframe: '5m',
  entryTimeframeLong: '15m',
  entryTimeframeShort: '5m',
  preOpenTimeframe: '15m',
  preOpenTimeframeLong: '15m',
  preOpenTimeframeShort: '15m',
  preOpenCandleCount: 20,
  preOpenMinVolumeRatio: 0.5,
  /** 0 = no rank cap — let every liquid pair through. */
  maxVolumeRank: 0,
  /** Shitcoin filter — liquid mid-caps; was $5M and starved opens. */
  minDayVolumeUsd: 1_000_000,
  useScalpAlignment: true,
  useAggressiveScalpSignals: true,
  enableHtfSr: false,
  enableLlmConfirm: false,
  /** LONGs on — allowlist via longOnlyCoins; non-listed memes never. */
  allowLongOpens: true,
  /** SHORT is primary in bear — opens allowed. */
  allowShortOpens: true,
  short: {
    ...PRIMARY_RULES,
    minConfidence: 58,
    minDirectionalTfs: 3,
    minTrendAlignment: 55,
    requiredH1Trend: 'DOWN',
    required15mTrend: 'DOWN',
    minConfirm15mCandles: 3,
    trustMtfScan: true,
    relaxSecondaryGates: true,
    bypassFreshPumpWhenTrusted: true,
    bypassMacroBetaWhenTrusted: true,
    bypassPumpShortWhenTrusted: true,
    bypassEntryLocationWhenTrusted: true,
    bypassPreOpenWhenTrusted: true,
    bypassScalpAlignWhenTrusted: true,
    bypassEntryMomentumWhenTrusted: true,
    bypassSrLocationWhenTrusted: true,
  },
  long: {
    ...COUNTER_TREND_RULES('UP'),
    minConfidence: 62,
    requiredH1Trend: 'UP',
    required5mTrend: 'UP',
    required15mTrend: 'UP',
    minConfirm15mCandles: 3,
  },
  reversalLong: BEAR_REVERSAL_LONG,
};
