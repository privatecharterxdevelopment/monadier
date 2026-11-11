/**
 * Alt SHORT timing — only after higher-TF rollover (not a blanket ban).
 * Pair may still be skipped earlier by freshPumpGate if recently pumped.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type PumpShortBlockCode =
  | 'PUMP_SHORT_SKIP_LONG'
  | 'PUMP_SHORT_SKIP_MAJOR'
  | 'PUMP_SHORT_HTF_LONG'
  | 'PUMP_SHORT_15M_1H_LONG'
  | 'PUMP_SHORT_STILL_PUMPING'
  | 'PUMP_SHORT_NO_ROLLOVER'
  | 'PUMP_SHORT_NO_SHORT_TF'
  | 'PUMP_SHORT_FETCH_ERROR'
  | 'PUMP_SHORT_PASS';

export type PumpShortResult = {
  ok: boolean;
  code: PumpShortBlockCode;
  reason: string;
  change15mPct?: number;
  change1hPct?: number;
  change4hPct?: number;
  higherLong?: number;
};

function pctChangeClosed(candles: Candle[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

export async function validateNoAltPumpShort(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<PumpShortResult> {
  if (opts.direction !== 'SHORT') {
    return { ok: true, code: 'PUMP_SHORT_SKIP_LONG', reason: 'Pump-short gate — LONG entries allowed' };
  }

  const coin = opts.coin.toUpperCase();
  if (coin === 'BTC' || coin === 'ETH') {
    return { ok: true, code: 'PUMP_SHORT_SKIP_MAJOR', reason: 'Pump-short gate — majors use macro beta only' };
  }

  const cfg = config.hyperliquid.pumpShort;
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [signal, c15m, c1h] = await Promise.all([
      signalEngine.generateSignal(symbol, ['1m', '5m', '15m', '1h']),
      signalEngine.fetchCandles(symbol, '15m', 16),
      signalEngine.fetchCandles(symbol, '1h', 8),
    ]);

    const higher = signal.timeframes.filter(
      (t) => t.timeframe === '5m' || t.timeframe === '15m' || t.timeframe === '1h'
    );
    const higherLong = higher.filter((t) => t.direction === 'LONG').length;
    if (higherLong >= cfg.minHigherTfLongBlock) {
      const reason =
        `SHORT blocked — ${coin}: ${higherLong}/3 higher TFs still LONG (no short after pump on alts)`;
      logger.info('Pump-short gate blocked', { coin, gate: 'pump_short', code: 'PUMP_SHORT_HTF_LONG', higherLong });
      return { ok: false, code: 'PUMP_SHORT_HTF_LONG', reason, higherLong };
    }

    const tf15 = signal.timeframes.find((t) => t.timeframe === '15m');
    const tf1h = signal.timeframes.find((t) => t.timeframe === '1h');
    if (tf1h?.direction === 'LONG' || tf15?.direction === 'LONG') {
      const reason =
        `SHORT blocked — ${coin}: 15m/1h signal still LONG (wait for rollover, not a 1m dip)`;
      logger.info('Pump-short gate blocked', {
        coin,
        gate: 'pump_short',
        code: 'PUMP_SHORT_15M_1H_LONG',
        tf15: tf15?.direction,
        tf1h: tf1h?.direction,
      });
      return { ok: false, code: 'PUMP_SHORT_15M_1H_LONG', reason };
    }

    const ch1h = pctChangeClosed(c1h, 1);
    const ch4h = pctChangeClosed(c1h, 4);
    const ch15m = pctChangeClosed(c15m, 1);

    if (ch1h >= cfg.block1hPct || ch4h >= cfg.block4hPct) {
      const reason =
        `SHORT blocked — ${coin} still pumping (1h ${ch1h >= 0 ? '+' : ''}${ch1h.toFixed(2)}%, ` +
        `4h ${ch4h >= 0 ? '+' : ''}${ch4h.toFixed(2)}%)`;
      logger.info('Pump-short gate blocked', {
        coin,
        gate: 'pump_short',
        code: 'PUMP_SHORT_STILL_PUMPING',
        change1hPct: ch1h,
        change4hPct: ch4h,
      });
      return { ok: false, code: 'PUMP_SHORT_STILL_PUMPING', reason, change1hPct: ch1h, change4hPct: ch4h, change15mPct: ch15m };
    }

    if (ch15m > -cfg.min15mRolloverPct) {
      const reason =
        `SHORT blocked — ${coin} 15m not rolling over (${ch15m >= 0 ? '+' : ''}${ch15m.toFixed(2)}%) — ` +
        `need clear fade, not a tiny pullback after pump`;
      logger.info('Pump-short gate blocked', {
        coin,
        gate: 'pump_short',
        code: 'PUMP_SHORT_NO_ROLLOVER',
        change15mPct: ch15m,
      });
      return { ok: false, code: 'PUMP_SHORT_NO_ROLLOVER', reason, change15mPct: ch15m, change1hPct: ch1h };
    }

    if (tf15?.direction !== 'SHORT' && tf1h?.direction !== 'SHORT') {
      return {
        ok: false,
        code: 'PUMP_SHORT_NO_SHORT_TF',
        reason: `SHORT blocked — ${coin}: need 15m or 1h SHORT confirmation before alt short`,
        change15mPct: ch15m,
        change1hPct: ch1h,
      };
    }

    return {
      ok: true,
      code: 'PUMP_SHORT_PASS',
      reason:
        `Alt SHORT ok ${coin} — higher TFs faded (15m ${ch15m.toFixed(2)}%, 1h ${ch1h.toFixed(2)}%)`,
      change15mPct: ch15m,
      change1hPct: ch1h,
      change4hPct: ch4h,
      higherLong,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Pump-short gate error — fail closed for alts', { coin, error: msg });
    return {
      ok: false,
      code: 'PUMP_SHORT_FETCH_ERROR',
      reason: `SHORT blocked — ${coin} pump check failed (${msg.slice(0, 60)})`,
    };
  }
}
