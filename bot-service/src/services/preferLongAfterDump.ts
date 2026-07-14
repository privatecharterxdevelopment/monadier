/**
 * Prefer LONG after a sharp dump near swing-low (bounce setups).
 * Boosts LONG confidence only — never blocks SHORT opens.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

function closedCandles(candles: Candle[]): Candle[] {
  return candles.length > 1 ? candles.slice(0, -1) : candles;
}

function pctChange(from: number, to: number): number {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return 0;
  return ((to - from) / from) * 100;
}

function recentDumpPct(candles: Candle[], bars: number): number {
  const closed = closedCandles(candles);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  return pctChange(start.close, end.close);
}

function bounceOffLowPct(candles: Candle[], lookback: number): number {
  const closed = closedCandles(candles);
  const slice = closed.slice(-Math.max(3, lookback));
  if (slice.length === 0) return 0;
  const low = Math.min(...slice.map((c) => c.low));
  const last = slice[slice.length - 1];
  return pctChange(low, last.close);
}

function nearSwingLowPct(candles: Candle[], lookback: number): number {
  const closed = closedCandles(candles);
  const slice = closed.slice(-Math.max(3, lookback));
  if (slice.length === 0) return 99;
  const low = Math.min(...slice.map((c) => c.low));
  const price = slice[slice.length - 1].close;
  return pctChange(low, price);
}

export type PreferLongBoost = {
  boostConfidence: number;
  reason: string | null;
};

/** LONG-only scan boost near dump bottoms. SHORT → no change. */
export async function preferLongAfterDumpBoost(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT' | 'HOLD';
}): Promise<PreferLongBoost> {
  if (opts.direction !== 'LONG') {
    return { boostConfidence: 0, reason: null };
  }

  const coin = opts.coin.toUpperCase();
  const cfg = config.hyperliquid.preferLongAfterDump;
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [c15m, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', Math.max(24, cfg.swingLookback15m + 4)),
      signalEngine.fetchCandles(symbol, '1h', Math.max(12, cfg.dumpLookback1hBars + 4)),
    ]);

    const dump15 = recentDumpPct(c15m, cfg.dumpLookback15mBars);
    const dump1h = recentDumpPct(c1h, cfg.dumpLookback1hBars);
    const nearLow = nearSwingLowPct(c15m, cfg.swingLookback15m);
    const bounce = bounceOffLowPct(c15m, cfg.swingLookback15m);

    const sharpDump =
      dump15 <= -cfg.sharpDump15mPct || dump1h <= -cfg.sharpDump1hPct;
    const atBottom = nearLow <= cfg.nearSwingLowPct;
    const bouncing = bounce >= cfg.minBouncePct && bounce <= cfg.maxBouncePct;

    if (sharpDump && atBottom && bouncing) {
      const boost = cfg.confidenceBoost;
      const reason =
        `Prefer LONG after dump — ${coin} bounce ${bounce.toFixed(2)}% off low ` +
        `(15m ${dump15.toFixed(2)}% · 1h ${dump1h.toFixed(2)}%) +${boost} conf`;
      logger.info('Prefer-LONG dump bounce boost', { coin, boost, bounce, dump15, dump1h });
      return { boostConfidence: boost, reason };
    }

    return { boostConfidence: 0, reason: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('Prefer-LONG dump boost skipped', { coin, error: msg.slice(0, 80) });
    return { boostConfidence: 0, reason: null };
  }
}
