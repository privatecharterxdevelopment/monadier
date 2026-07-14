/**
 * Block SHORT into a fresh swing-low / after a sharp dump — wait for bounce confirmation.
 * Prevents "short the exact bottom" after flush sells (XRP-style).
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type DumpBottomShortResult = {
  ok: boolean;
  reason: string;
};

function closedCandles(candles: Candle[]): Candle[] {
  return candles.length > 1 ? candles.slice(0, -1) : candles;
}

function pctChange(from: number, to: number): number {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return 0;
  return ((to - from) / from) * 100;
}

function swingLow(candles: Candle[], lookback: number): number {
  const closed = closedCandles(candles);
  const slice = closed.slice(-Math.max(3, lookback));
  let low = Number.POSITIVE_INFINITY;
  for (const c of slice) {
    if (Number.isFinite(c.low) && c.low < low) low = c.low;
  }
  return low;
}

function recentDumpPct(candles: Candle[], bars: number): number {
  const closed = closedCandles(candles);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  return pctChange(start.close, end.close);
}

/** True if price bounced enough off the local low after a dump. */
function bounceOffLowPct(candles: Candle[], lookback: number): number {
  const closed = closedCandles(candles);
  const slice = closed.slice(-Math.max(3, lookback));
  if (slice.length === 0) return 0;
  const low = Math.min(...slice.map((c) => c.low));
  const last = slice[slice.length - 1];
  return pctChange(low, last.close);
}

export async function validateNoDumpBottomShort(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<DumpBottomShortResult> {
  if (opts.direction !== 'SHORT') {
    return { ok: true, reason: 'Dump-bottom gate — LONG entries not restricted' };
  }

  const coin = opts.coin.toUpperCase();
  const cfg = config.hyperliquid.dumpBottomShort;
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [c15m, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', Math.max(24, cfg.swingLookback15m + 4)),
      signalEngine.fetchCandles(symbol, '1h', Math.max(12, cfg.dumpLookback1hBars + 4)),
    ]);

    const closed15 = closedCandles(c15m);
    if (closed15.length < 6) {
      return { ok: false, reason: `SHORT blocked — ${coin}: insufficient 15m data for dump/swing check` };
    }

    const price = closed15[closed15.length - 1].close;
    const low15 = swingLow(c15m, cfg.swingLookback15m);
    const nearLowPct = pctChange(low15, price);
    const bounce15 = bounceOffLowPct(c15m, cfg.swingLookback15m);
    const dump15 = recentDumpPct(c15m, cfg.dumpLookback15mBars);
    const dump1h = recentDumpPct(c1h, cfg.dumpLookback1hBars);

    const sharpDump =
      dump15 <= -cfg.sharpDump15mPct || dump1h <= -cfg.sharpDump1hPct;

    // Near fresh swing low without enough bounce = shorting the floor.
    if (nearLowPct <= cfg.nearSwingLowPct && bounce15 < cfg.minBounceBeforeShortPct) {
      const reason =
        `SHORT blocked — ${coin} near fresh swing low ` +
        `(${nearLowPct >= 0 ? '+' : ''}${nearLowPct.toFixed(2)}% off low · bounce ${bounce15.toFixed(2)}%, ` +
        `need ≥${cfg.minBounceBeforeShortPct}% confirmation)`;
      logger.info('Dump-bottom SHORT blocked', { coin, nearLowPct, bounce15, dump15, dump1h });
      return { ok: false, reason };
    }

    // Sharp dump without bounce confirmation — wait for reclaim attempt / fade setup.
    if (sharpDump && bounce15 < cfg.minBounceBeforeShortPct) {
      const reason =
        `SHORT blocked — ${coin} sharp dump without confirmation ` +
        `(15m ${dump15.toFixed(2)}% · 1h ${dump1h.toFixed(2)}% · bounce only ${bounce15.toFixed(2)}%, ` +
        `need ≥${cfg.minBounceBeforeShortPct}% off low before short)`;
      logger.info('Dump-bottom SHORT blocked', { coin, dump15, dump1h, bounce15 });
      return { ok: false, reason };
    }

    return {
      ok: true,
      reason: sharpDump
        ? `SHORT ok ${coin} — dump faded with bounce (${bounce15.toFixed(2)}% off low)`
        : `SHORT ok ${coin} — not flush-bottom (${nearLowPct.toFixed(2)}% off swing low)`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Dump-bottom SHORT gate error — fail closed', { coin, error: msg });
    return {
      ok: false,
      reason: `SHORT blocked — ${coin} dump/swing check failed (${msg.slice(0, 60)})`,
    };
  }
}
