/**
 * Hard rule: never open a NEW LONG on the tip of a vertical spike.
 * LIT was bought at the high of a fat 1h green. BTC exploding does not waive this.
 *
 * Taking a fat candle means riding it from below, then closing — not buying the wick.
 * Always runs. No trusted / secondary-gate bypass.
 */
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type SpikeHighLongResult = {
  ok: boolean;
  reason: string;
};

function bodyPct(c: Candle): number {
  const open = Number(c.open);
  if (!open || open <= 0) return 0;
  return ((Number(c.close) - open) / open) * 100;
}

function posInBar(price: number, c: Candle): number {
  const span = Number(c.high) - Number(c.low);
  if (!(span > 0)) return 0.5;
  return (price - Number(c.low)) / span;
}

function nearBarHigh(price: number, c: Candle, pct = 0.005): boolean {
  const high = Number(c.high);
  if (!(high > 0)) return false;
  return price >= high * (1 - pct);
}

function isFatGreen(c: Candle, minBodyPct: number): boolean {
  return Number(c.close) > Number(c.open) && bodyPct(c) >= minBodyPct;
}

function rangeHighPos(candles: Candle[], price: number, lookback: number): number {
  const slice = candles.slice(-lookback);
  if (slice.length < 4 || !(price > 0)) return 0.5;
  const hi = Math.max(...slice.map((c) => Number(c.high)));
  const lo = Math.min(...slice.map((c) => Number(c.low)));
  const span = hi - lo;
  if (!(span > 0)) return 0.5;
  return (price - lo) / span;
}

export async function validateNoLongAtSpikeHigh(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  markPx?: number;
}): Promise<SpikeHighLongResult> {
  if (opts.direction !== 'LONG') {
    return { ok: true, reason: 'Spike-high gate — SHORT not restricted' };
  }

  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [c15, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', 16),
      signalEngine.fetchCandles(symbol, '1h', 14),
    ]);
    if (c15.length < 4 || c1h.length < 4) {
      return { ok: false, reason: `LONG blocked — ${coin} spike-high check needs candles` };
    }

    const live15 = c15[c15.length - 1];
    const live1h = c1h[c1h.length - 1];
    const mark =
      opts.markPx && opts.markPx > 0
        ? opts.markPx
        : Number(live15.close) || Number(live1h.close);

    const fat1h = [live1h, c1h[c1h.length - 2]].filter(
      (c): c is Candle => !!c && isFatGreen(c, 1.2)
    );
    const fat15 = [live15, c15[c15.length - 2], c15[c15.length - 3]].filter(
      (c): c is Candle => !!c && isFatGreen(c, 0.6)
    );

    for (const c of fat1h) {
      if (nearBarHigh(mark, c, 0.006) || posInBar(mark, c) >= 0.85) {
        const reason = `LONG blocked — ${coin} at the high of a fat 1h spike (+${bodyPct(c).toFixed(2)}%) — never buy the tip`;
        logger.info('Spike-high LONG blocked', { coin, tf: '1h', bodyPct: bodyPct(c), mark });
        return { ok: false, reason };
      }
    }
    for (const c of fat15) {
      if (nearBarHigh(mark, c, 0.005) || posInBar(mark, c) >= 0.88) {
        const reason = `LONG blocked — ${coin} at the high of a fat 15m spike (+${bodyPct(c).toFixed(2)}%) — never buy the tip`;
        logger.info('Spike-high LONG blocked', { coin, tf: '15m', bodyPct: bodyPct(c), mark });
        return { ok: false, reason };
      }
    }

    const pos1h = rangeHighPos(c1h, mark, 12);
    if (pos1h >= 0.92 && (fat1h.length > 0 || fat15.length > 0)) {
      const reason = `LONG blocked — ${coin} in top ${(pos1h * 100).toFixed(0)}% of 12h range after a spike — not a high LONG`;
      logger.info('Spike-high LONG blocked', { coin, pos1h, mark });
      return { ok: false, reason };
    }

    return { ok: true, reason: `Spike-high OK — ${coin} not buying a fat-candle tip` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Spike-high gate error — fail closed', { coin, error: msg });
    return {
      ok: false,
      reason: `LONG blocked — ${coin} spike-high check failed (${msg.slice(0, 50)})`,
    };
  }
}
