/**
 * Alt SHORT timing — only after higher-TF rollover (not a blanket ban).
 * Also blocks SHORT into a green candle run (5–13 green 5m / majority-green tape).
 * Pair may still be skipped earlier by freshPumpGate if recently pumped.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type PumpShortResult = {
  ok: boolean;
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

/** Live read — includes the forming candle (catches vollgas pumps RSI shorts miss). */
function pctChangeLive(candles: Candle[], bars: number): number {
  if (candles.length < bars + 1) return 0;
  const end = candles[candles.length - 1];
  const start = candles[candles.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function consecutiveGreenClosed(candles: Candle[], max = 13): number {
  const closed = candles.slice(0, -1);
  let n = 0;
  for (let i = closed.length - 1; i >= 0 && n < max; i -= 1) {
    if (closed[i].close > closed[i].open) n += 1;
    else break;
  }
  return n;
}

/** Count green bodies in the last N closed candles (overall “tape is green”). */
function greenCountInLast(candles: Candle[], lookback: number): { green: number; total: number } {
  const closed = candles.slice(0, -1);
  const slice = closed.slice(-lookback);
  let green = 0;
  for (const c of slice) {
    if (c.close > c.open) green += 1;
  }
  return { green, total: slice.length };
}

/**
 * Hard rule: do not SHORT a green run.
 * User: 5–13 green candles + overall green picture → no short (favor long / wait).
 */
function blockGreenRunShort(
  coin: string,
  c5m: Candle[],
  c15m: Candle[]
): PumpShortResult | null {
  const green5m = consecutiveGreenClosed(c5m, 13);
  const live5m = pctChangeLive(c5m, 1);
  if (green5m >= 5) {
    const reason =
      `SHORT blocked — ${coin} ${green5m}× green 5m run (need fade, not short into green tape)`;
    logger.info('Pump-short gate blocked — green 5m streak', { coin, green5m, live5m });
    return { ok: false, reason };
  }

  const { green, total } = greenCountInLast(c5m, 13);
  const net13 = pctChangeClosed(c5m, Math.min(13, Math.max(1, total)));
  if (total >= 8 && green >= 8 && net13 > 0) {
    const reason =
      `SHORT blocked — ${coin} overall green tape (${green}/${total} green 5m, net ${net13 >= 0 ? '+' : ''}${net13.toFixed(2)}%)`;
    logger.info('Pump-short gate blocked — majority green', { coin, green, total, net13 });
    return { ok: false, reason };
  }

  const green15m = consecutiveGreenClosed(c15m, 8);
  if (green15m >= 4) {
    const reason =
      `SHORT blocked — ${coin} ${green15m}× green 15m — higher TF still climbing`;
    logger.info('Pump-short gate blocked — green 15m streak', { coin, green15m });
    return { ok: false, reason };
  }

  if (green5m >= 3 && live5m >= 0) {
    const reason =
      `SHORT blocked — ${coin} ${green5m}× green 5m + live +${live5m.toFixed(2)}% — wait for rollover`;
    logger.info('Pump-short gate blocked — green streak', { coin, green5m, live5m });
    return { ok: false, reason };
  }

  return null;
}

export async function validateNoAltPumpShort(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<PumpShortResult> {
  if (opts.direction !== 'SHORT') {
    return { ok: true, reason: 'Pump-short gate — LONG entries allowed' };
  }

  const coin = opts.coin.toUpperCase();
  const cfg = config.hyperliquid.pumpShort;
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [c5m, c15m] = await Promise.all([
      signalEngine.fetchCandles(symbol, '5m', 32),
      signalEngine.fetchCandles(symbol, '15m', 20),
    ]);

    // All coins (incl. BTC/ETH): never short a clear green run.
    const greenBlock = blockGreenRunShort(coin, c5m, c15m);
    if (greenBlock) return greenBlock;

    if (coin === 'BTC' || coin === 'ETH') {
      return { ok: true, reason: 'Pump-short gate — majors green-run clear; macro beta handles rest' };
    }

    const [signal, c1h] = await Promise.all([
      signalEngine.generateSignal(symbol, ['1m', '5m', '15m', '1h']),
      signalEngine.fetchCandles(symbol, '1h', 8),
    ]);

    const live5m = pctChangeLive(c5m, 1);
    const live15m = pctChangeLive(c15m, 1);
    const net5x5m = pctChangeClosed(c5m, 5);

    if (live5m > 0.08 && live15m > 0.05) {
      const reason =
        `SHORT blocked — ${coin} still heating (live 5m +${live5m.toFixed(2)}%, 15m +${live15m.toFixed(2)}%) — no short into vollgas pump`;
      logger.info('Pump-short gate blocked — live heat', { coin, live5m, live15m });
      return { ok: false, reason };
    }
    if (net5x5m >= 0.35) {
      const reason =
        `SHORT blocked — ${coin} +${net5x5m.toFixed(2)}% over last 5×5m — pair still pumping`;
      logger.info('Pump-short gate blocked — 5m net pump', { coin, net5x5m });
      return { ok: false, reason };
    }

    const higher = signal.timeframes.filter(
      (t) => t.timeframe === '5m' || t.timeframe === '15m' || t.timeframe === '1h'
    );
    const higherLong = higher.filter((t) => t.direction === 'LONG').length;
    if (higherLong >= cfg.minHigherTfLongBlock) {
      const reason =
        `SHORT blocked — ${coin}: ${higherLong}/3 higher TFs still LONG (no short after pump on alts)`;
      logger.info('Pump-short gate blocked', { coin, higherLong });
      return { ok: false, reason };
    }

    const tf15 = signal.timeframes.find((t) => t.timeframe === '15m');
    const tf1h = signal.timeframes.find((t) => t.timeframe === '1h');
    if (tf1h?.direction === 'LONG' || tf15?.direction === 'LONG') {
      const reason =
        `SHORT blocked — ${coin}: 15m/1h signal still LONG (wait for rollover, not a 1m dip)`;
      logger.info('Pump-short gate blocked', { coin, tf15: tf15?.direction, tf1h: tf1h?.direction });
      return { ok: false, reason };
    }

    const ch1h = pctChangeClosed(c1h, 1);
    const ch4h = pctChangeClosed(c1h, 4);
    const ch15m = pctChangeClosed(c15m, 1);

    if (ch1h >= cfg.block1hPct || ch4h >= cfg.block4hPct) {
      const reason =
        `SHORT blocked — ${coin} still pumping (1h ${ch1h >= 0 ? '+' : ''}${ch1h.toFixed(2)}%, ` +
        `4h ${ch4h >= 0 ? '+' : ''}${ch4h.toFixed(2)}%)`;
      logger.info('Pump-short gate blocked', { coin, ch1h, ch4h });
      return { ok: false, reason };
    }

    if (ch15m > -cfg.min15mRolloverPct || live15m > -cfg.min15mRolloverPct) {
      const reason =
        `SHORT blocked — ${coin} 15m not rolling over (closed ${ch15m >= 0 ? '+' : ''}${ch15m.toFixed(2)}%, ` +
        `live ${live15m >= 0 ? '+' : ''}${live15m.toFixed(2)}%) — need clear fade, not a heated pump`;
      logger.info('Pump-short gate blocked', { coin, ch15m, live15m });
      return { ok: false, reason };
    }

    if (tf15?.direction !== 'SHORT' && tf1h?.direction !== 'SHORT') {
      return {
        ok: false,
        reason: `SHORT blocked — ${coin}: need 15m or 1h SHORT confirmation before alt short`,
      };
    }

    return {
      ok: true,
      reason:
        `Alt SHORT ok ${coin} — higher TFs faded (15m ${ch15m.toFixed(2)}%, 1h ${ch1h.toFixed(2)}%)`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Pump-short gate error — fail closed for alts', { coin, error: msg });
    return {
      ok: false,
      reason: `SHORT blocked — ${coin} pump check failed (${msg.slice(0, 60)})`,
    };
  }
}
