/**
 * SHORT timing — block only a live green stampede, not the high itself.
 * HH/HL and “15m still LONG” are the top of the range; those may SHORT.
 */
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
  // Only obvious green stampedes — 5 was blocking normal pullback shorts.
  if (green5m >= 8) {
    const reason =
      `SHORT blocked — ${coin} ${green5m}× green 5m run (need fade, not short into green tape)`;
    logger.info('Pump-short gate blocked — green 5m streak', { coin, green5m, live5m });
    return { ok: false, reason };
  }

  const { green, total } = greenCountInLast(c5m, 13);
  const net13 = pctChangeClosed(c5m, Math.min(13, Math.max(1, total)));
  if (total >= 10 && green >= 10 && net13 > 0.5) {
    const reason =
      `SHORT blocked — ${coin} overall green tape (${green}/${total} green 5m, net ${net13 >= 0 ? '+' : ''}${net13.toFixed(2)}%)`;
    logger.info('Pump-short gate blocked — majority green', { coin, green, total, net13 });
    return { ok: false, reason };
  }

  const green15m = consecutiveGreenClosed(c15m, 8);
  if (green15m >= 5) {
    const reason =
      `SHORT blocked — ${coin} ${green15m}× green 15m — higher TF still climbing`;
    logger.info('Pump-short gate blocked — green 15m streak', { coin, green15m });
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
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [c5m, c15m] = await Promise.all([
      signalEngine.fetchCandles(symbol, '5m', 32),
      signalEngine.fetchCandles(symbol, '15m', 20),
    ]);

    // Don't short a green stampede. Structure (HH/HL, 15m still LONG) is the high — that is a SHORT.
    const greenBlock = blockGreenRunShort(coin, c5m, c15m);
    if (greenBlock) return greenBlock;

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

    return {
      ok: true,
      reason: `SHORT timing ok ${coin} — not a green stampede`,
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
