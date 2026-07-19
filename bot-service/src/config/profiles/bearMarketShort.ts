import {
  COUNTER_TREND_RULES,
  PRIMARY_RULES,
  type HlDirectionProfile,
} from './types';

/**
 * BEAR MARKET — SHORT-first regime.
 *
 * Faithful replica of the bot's behavior from ~Jun 26 – Jul 13, the only period
 * that consistently performed. Key structural values restored to their June-26
 * defaults so the short engine behaves like it did then:
 *   - maxVolumeRank 18   (June: tight top-18-by-volume universe)
 *   - preOpen 20 candles / 1m  (June: HL_PRE_OPEN_CANDLE_COUNT 20, TF 1m)
 *   - 1m/5m analysis, 5m entry grouping, scalp 1m/5m alignment ON
 *   - HTF S/R gate OFF (did not exist on Jun 26)
 *
 * SHORT = primary (aggressive). LONG = counter-trend only (strict, h1 UP).
 */
export const BEAR_MARKET: HlDirectionProfile = {
  name: 'bear_market',
  description:
    'June-26 SHORT replica: 1m/5m analysis, 5m entry, 1m/20-candle pre-open, top-18 universe, no HTF gate.',
  primaryDirection: 'SHORT',
  analysisTimeframes: ['1m', '5m'],
  entryTimeframe: '5m',
  preOpenTimeframe: '1m',
  preOpenCandleCount: 20,
  maxVolumeRank: 18,
  useScalpAlignment: true,
  useAggressiveScalpSignals: true,
  enableHtfSr: false,
  short: { ...PRIMARY_RULES },
  long: COUNTER_TREND_RULES('UP'),
};
