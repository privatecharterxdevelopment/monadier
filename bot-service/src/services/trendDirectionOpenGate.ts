/**
 * Live trend re-check immediately before every HL open.
 * Scan-time signals can be minutes old; pump pullbacks must not open counter-trend shorts.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { analyzeMarketMTFBySymbol } from './market';
import { evaluateScanTrendAlignment } from './higherTfAlignment';
import { validateNoAltPumpShort } from './pumpShortGate';
import { validatePerpMarketContext } from './perpMarketContextGate';
import { validatePreOpenCandleAnalytics } from './preOpenCandleAnalytics';
import { validateBtcMacroAllowsShort } from './btcMacroShortGate';
import { trendOnlyBlockReason } from './trendOnly';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type TrendDirectionOpenResult = {
  ok: boolean;
  reason: string;
};

export async function validateTrendDirectionAtOpen(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  botMode?: 'standard' | 'aggressive';
}): Promise<TrendDirectionOpenResult> {
  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);
  const minConf = config.hyperliquid.minSignalConfidence;

  if (opts.direction === 'SHORT') {
    const btcMacro = await validateBtcMacroAllowsShort({ coin });
    if (!btcMacro.ok) {
      return { ok: false, reason: btcMacro.reason };
    }
  }

  const analysis = await analyzeMarketMTFBySymbol(symbol, 'normal');
  if (!analysis) {
    return { ok: false, reason: `Open blocked — ${coin}: no live MTF analysis` };
  }
  if (analysis.isWeak) {
    return {
      ok: false,
      reason: analysis.reason || `Open blocked — ${coin}: weak ${analysis.direction} setup`,
    };
  }

  const tradeTrend = analysis.metrics?.h1Trend ?? 'SIDEWAYS';
  const trendBlock = trendOnlyBlockReason(opts.direction, tradeTrend);
  if (trendBlock) {
    return { ok: false, reason: `Open blocked — ${trendBlock}` };
  }

  if (analysis.direction !== opts.direction) {
    return {
      ok: false,
      reason:
        `Open blocked — live MTF is ${analysis.direction} ${analysis.confidence}%` +
        ` (requested ${opts.direction}, macro ${tradeTrend})`,
    };
  }

  const trend = await evaluateScanTrendAlignment({
    coin,
    direction: opts.direction,
    baseConfidence: analysis.confidence,
    minConfidence: minConf,
    h1Trend: analysis.metrics?.h1Trend,
    directionalTfCount: analysis.metrics?.directionalTfCount,
  });
  if (!trend.ok) {
    return { ok: false, reason: `Open blocked — ${trend.reason}` };
  }

  if (opts.direction === 'SHORT') {
    const pump = await validateNoAltPumpShort({ coin, direction: 'SHORT' });
    if (!pump.ok) {
      return { ok: false, reason: pump.reason };
    }
  }

  const perp = await validatePerpMarketContext({ coin, direction: opts.direction });
  if (!perp.ok) {
    return { ok: false, reason: perp.reason };
  }

  logger.debug('Trend direction open gate passed', {
    coin,
    direction: opts.direction,
    tradeTrend,
    confidence: analysis.confidence,
  });

  return {
    ok: true,
    reason: `Trend OK — ${opts.direction} · macro ${tradeTrend} · MTF ${analysis.confidence}%`,
  };
}

export async function validatePreOpenAnalyticsAtOpen(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  botMode?: 'standard' | 'aggressive';
}): Promise<TrendDirectionOpenResult> {
  const tf = opts.botMode === 'aggressive' ? '1m' : '5m';
  const result = await validatePreOpenCandleAnalytics({
    coin: opts.coin,
    direction: opts.direction,
    timeframe: tf,
  });
  return { ok: result.ok, reason: result.reason };
}
