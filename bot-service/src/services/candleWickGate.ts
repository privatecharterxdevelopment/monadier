/**
 * Long-wick candle gate — user trading rule:
 *   Green / recovery with long LOWER wick = demand ate the dump → never SHORT into it.
 *   Red / rejection with long UPPER wick = supply ate the pump → never LONG into it.
 *
 * Always runs (no trusted bypass). Matches the classic “long wick” teaching candles.
 */
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type CandleWickGateResult = {
  ok: boolean;
  reason: string;
};

function wickParts(c: Candle): {
  range: number;
  body: number;
  lower: number;
  upper: number;
  bullish: boolean;
} | null {
  const range = c.high - c.low;
  if (!(range > 0) || !Number.isFinite(range)) return null;
  const body = Math.abs(c.close - c.open);
  const lower = Math.min(c.open, c.close) - c.low;
  const upper = c.high - Math.max(c.open, c.close);
  return {
    range,
    body,
    lower: Math.max(0, lower),
    upper: Math.max(0, upper),
    bullish: c.close >= c.open,
  };
}

/** Bullish long lower wick — dump rejected, buyers in control (hammer / absorption). */
export function isBullishLongLowerWick(c: Candle): boolean {
  const w = wickParts(c);
  if (!w) return false;
  const lowerFrac = w.lower / w.range;
  const bodyFrac = w.body / w.range;
  const closePos = (c.close - c.low) / w.range;
  // Lower wick dominates; small body; close in upper half of range.
  return lowerFrac >= 0.5 && bodyFrac <= 0.45 && closePos >= 0.55;
}

/** Bearish long upper wick — pump rejected, sellers in control. */
export function isBearishLongUpperWick(c: Candle): boolean {
  const w = wickParts(c);
  if (!w) return false;
  const upperFrac = w.upper / w.range;
  const bodyFrac = w.body / w.range;
  const closePos = (c.close - c.low) / w.range;
  return upperFrac >= 0.5 && bodyFrac <= 0.45 && closePos <= 0.45;
}

/**
 * Live candle being “eaten” green from the lows — still forming, long lower shadow,
 * close pushed back up. Do not SHORT into that.
 */
export function isLiveBullishAbsorption(c: Candle): boolean {
  const w = wickParts(c);
  if (!w) return false;
  const lowerFrac = w.lower / w.range;
  const closePos = (c.close - c.low) / w.range;
  return (w.bullish || closePos >= 0.6) && lowerFrac >= 0.4 && closePos >= 0.6;
}

function recentBullishDemand(candles: Candle[], lookbackClosed = 3): {
  hit: boolean;
  detail: string;
} {
  if (candles.length < 2) return { hit: false, detail: '' };
  const forming = candles[candles.length - 1]!;
  const closed = candles.slice(0, -1).slice(-lookbackClosed);

  if (isLiveBullishAbsorption(forming)) {
    return { hit: true, detail: 'live 1h/15m absorption (long lower wick, close off lows)' };
  }
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    const c = closed[i]!;
    if (isBullishLongLowerWick(c)) {
      return {
        hit: true,
        detail: `closed long-lower-wick demand candle (${closed.length - i} bar(s) ago)`,
      };
    }
  }
  // Two+ of last 3 closed are green with meaningful lower wick (≥35%)
  let demandish = 0;
  for (const c of closed) {
    const w = wickParts(c);
    if (!w) continue;
    if (w.bullish && w.lower / w.range >= 0.35 && (c.close - c.low) / w.range >= 0.55) {
      demandish += 1;
    }
  }
  if (demandish >= 2) {
    return { hit: true, detail: `${demandish}/${closed.length} recent green demand wicks` };
  }
  return { hit: false, detail: '' };
}

function recentBearishSupply(candles: Candle[], lookbackClosed = 3): {
  hit: boolean;
  detail: string;
} {
  if (candles.length < 2) return { hit: false, detail: '' };
  const forming = candles[candles.length - 1]!;
  const closed = candles.slice(0, -1).slice(-lookbackClosed);

  const fw = wickParts(forming);
  if (
    fw &&
    fw.upper / fw.range >= 0.4 &&
    (forming.high - forming.close) / fw.range >= 0.55
  ) {
    return { hit: true, detail: 'live rejection (long upper wick, close off highs)' };
  }
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    const c = closed[i]!;
    if (isBearishLongUpperWick(c)) {
      return {
        hit: true,
        detail: `closed long-upper-wick rejection (${closed.length - i} bar(s) ago)`,
      };
    }
  }
  return { hit: false, detail: '' };
}

export async function validateCandleWickGate(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<CandleWickGateResult> {
  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [c15m, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', 16),
      signalEngine.fetchCandles(symbol, '1h', 16),
    ]);

    if (opts.direction === 'SHORT') {
      const h1 = recentBullishDemand(c1h, 3);
      if (h1.hit) {
        const reason = `SHORT blocked — ${coin} bullish long-wick demand on 1h (${h1.detail}) — candle was bought / eaten`;
        logger.info('Candle wick gate blocked SHORT', { coin, tf: '1h', detail: h1.detail });
        return { ok: false, reason };
      }
      const m15 = recentBullishDemand(c15m, 3);
      if (m15.hit) {
        const reason = `SHORT blocked — ${coin} bullish long-wick demand on 15m (${m15.detail}) — no short into absorption`;
        logger.info('Candle wick gate blocked SHORT', { coin, tf: '15m', detail: m15.detail });
        return { ok: false, reason };
      }
      return { ok: true, reason: `Candle wick OK SHORT ${coin} — no long-lower-wick demand` };
    }

    // LONG: block into long upper wick rejection
    const h1 = recentBearishSupply(c1h, 3);
    if (h1.hit) {
      const reason = `LONG blocked — ${coin} bearish long-wick rejection on 1h (${h1.detail})`;
      logger.info('Candle wick gate blocked LONG', { coin, tf: '1h', detail: h1.detail });
      return { ok: false, reason };
    }
    const m15 = recentBearishSupply(c15m, 3);
    if (m15.hit) {
      const reason = `LONG blocked — ${coin} bearish long-wick rejection on 15m (${m15.detail})`;
      logger.info('Candle wick gate blocked LONG', { coin, tf: '15m', detail: m15.detail });
      return { ok: false, reason };
    }
    return { ok: true, reason: `Candle wick OK LONG ${coin} — no long-upper-wick rejection` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Candle wick gate error — fail closed', { coin, error: msg });
    return {
      ok: false,
      reason: `Entry blocked — ${coin} wick check failed (${msg.slice(0, 60)})`,
    };
  }
}
