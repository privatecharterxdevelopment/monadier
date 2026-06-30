/**
 * Alt SHORT — 4h / ~24h structural bias (soft filter, not a hard ban).
 * Strong macro UP → higher bar for SHORT. Strong macro DOWN → slight favor.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { MAJOR_COINS } from './coinTier';

export type HigherTfRegime = 'strong_up' | 'neutral' | 'strong_down';

export type HigherTfShortBias = {
  regime: HigherTfRegime;
  ch4h: number;
  ch24h: number;
  confidenceAdjust: number;
  minConfidenceExtra: number;
  reason: string;
};

function pctChangeClosed(candles: Candle[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function neutralBias(ch4h = 0, ch24h = 0): HigherTfShortBias {
  return {
    regime: 'neutral',
    ch4h,
    ch24h,
    confidenceAdjust: 0,
    minConfidenceExtra: 0,
    reason: '4h/24h neutral — normal SHORT criteria',
  };
}

function classifyRegime(ch4h: number, ch24h: number): HigherTfRegime {
  const cfg = config.hyperliquid.higherTfShort;
  const upScore = Math.max(
    ch4h >= cfg.strongUp4hPct ? ch4h / cfg.strongUp4hPct : 0,
    ch24h >= cfg.strongUp24hPct ? ch24h / cfg.strongUp24hPct : 0
  );
  const downScore = Math.max(
    ch4h <= cfg.strongDown4hPct ? Math.abs(ch4h / cfg.strongDown4hPct) : 0,
    ch24h <= cfg.strongDown24hPct ? Math.abs(ch24h / cfg.strongDown24hPct) : 0
  );

  if (upScore > 1 && upScore >= downScore) return 'strong_up';
  if (downScore > 1 && downScore > upScore) return 'strong_down';
  return 'neutral';
}

/** Live 4h + ~24h (6×4h) move for alt SHORT bias — majors skipped. */
export async function assessHigherTfShortBias(coin: string): Promise<HigherTfShortBias> {
  const cfg = config.hyperliquid.higherTfShort;
  const key = coin.toUpperCase();
  if (!cfg.enabled || MAJOR_COINS.has(key)) {
    return neutralBias();
  }

  try {
    const symbol = hlCoinToBinanceSymbol(key);
    const [c4h, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '4h', 8),
      signalEngine.fetchCandles(symbol, '1h', 26),
    ]);

    const ch4h = pctChangeClosed(c4h, 1);
    const ch24h =
      c1h.length >= 25
        ? pctChangeClosed(c1h, 24)
        : c4h.length >= 7
          ? pctChangeClosed(c4h, 6)
          : 0;

    const regime = classifyRegime(ch4h, ch24h);
    if (regime === 'neutral') {
      return neutralBias(ch4h, ch24h);
    }

    if (regime === 'strong_up') {
      return {
        regime,
        ch4h,
        ch24h,
        confidenceAdjust: -cfg.shortConfPenaltyStrongUp,
        minConfidenceExtra: cfg.shortMinConfBumpStrongUp,
        reason:
          `4h/24h UP (4h ${ch4h >= 0 ? '+' : ''}${ch4h.toFixed(2)}%, 24h ${ch24h >= 0 ? '+' : ''}${ch24h.toFixed(2)}%) — SHORT needs stronger setup`,
      };
    }

    return {
      regime,
      ch4h,
      ch24h,
      confidenceAdjust: cfg.shortConfBonusStrongDown,
      minConfidenceExtra: 0,
      reason:
        `4h/24h DOWN (4h ${ch4h.toFixed(2)}%, 24h ${ch24h.toFixed(2)}%) — SHORT aligned with macro`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('Higher-TF SHORT bias unavailable — neutral', { coin: key, error: msg });
    return neutralBias();
  }
}

export function evaluateShortWithHigherTfBias(
  baseConfidence: number,
  minConfidence: number,
  bias: HigherTfShortBias
): {
  ok: boolean;
  adjustedConfidence: number;
  requiredConfidence: number;
  reason: string;
} {
  const adjustedConfidence = baseConfidence + bias.confidenceAdjust;
  const requiredConfidence = minConfidence + bias.minConfidenceExtra;
  const ok = adjustedConfidence >= requiredConfidence;
  return {
    ok,
    adjustedConfidence,
    requiredConfidence,
    reason: ok
      ? `${bias.reason} · effective ${adjustedConfidence.toFixed(0)}% (need ${requiredConfidence}%)`
      : `${bias.reason} · effective ${adjustedConfidence.toFixed(0)}% < ${requiredConfidence}%`,
  };
}
