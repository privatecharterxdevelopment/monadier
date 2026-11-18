/**
 * Block LONG opens into a clear red dump tape.
 * User rule: market going down → SHORT, never LONG.
 * Also: alt LONGs blocked when BTC itself is dumping (OP/SNX knife into BTC red).
 */
import { logger } from '../utils/logger';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type LongDumpTapeResult = {
  ok: boolean;
  reason: string;
};

function tapeHit(
  label: string,
  candles: Array<{ open: number; close: number }>,
  lookback: number
): string | null {
  if (candles.length < lookback + 1) return null;
  const closed = candles.slice(0, -1).slice(-lookback);
  if (closed.length < lookback) return null;
  const red = closed.filter((c) => c.close < c.open).length;
  const first = closed[0]!;
  const last = closed[closed.length - 1]!;
  const netPct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  // Real dump only — chop (4/5 red, net flat) must not freeze the whole book.
  if (netPct <= -0.45) {
    return `LONG blocked — ${label} net ${netPct.toFixed(2)}% — dump tape, no long into red`;
  }
  if (red >= 4 && netPct < -0.18) {
    return `LONG blocked — ${label} ${red}/${lookback} red (net ${netPct.toFixed(2)}%) — dump tape, no long into red`;
  }
  if (red >= 3 && netPct < -0.32) {
    return `LONG blocked — ${label} ${red}/${lookback} red (net ${netPct.toFixed(2)}%) — dump tape, no long into red`;
  }
  return null;
}

export async function validateLongDumpTapeGate(opts: {
  coin: string;
}): Promise<LongDumpTapeResult> {
  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const needBtcAnchor = coin !== 'BTC';
    const [c15m, c1h, c5m, c4h, btc15, btc1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', 12),
      signalEngine.fetchCandles(symbol, '1h', 12),
      signalEngine.fetchCandles(symbol, '5m', 16),
      signalEngine.fetchCandles(symbol, '4h', 16),
      needBtcAnchor
        ? signalEngine.fetchCandles('BTCUSDT', '15m', 12)
        : Promise.resolve([] as Awaited<ReturnType<typeof signalEngine.fetchCandles>>),
      needBtcAnchor
        ? signalEngine.fetchCandles('BTCUSDT', '1h', 12)
        : Promise.resolve([] as Awaited<ReturnType<typeof signalEngine.fetchCandles>>),
    ]);

    if (needBtcAnchor) {
      const btc15Hit = tapeHit('BTC 15m', btc15, 5);
      const btc1hHit = tapeHit('BTC 1h', btc1h, 5);
      // Only veto alts when BTC itself is dumping hard (not mild 4/5 red, net flat).
      const btcDumping = Boolean(btc15Hit && btc15Hit.includes('net -') && !btc15Hit.includes('net +'));
      const btc1hDumping = Boolean(btc1hHit && btc1hHit.includes('net -') && !btc1hHit.includes('net +'));
      if (btcDumping) {
        logger.info('Long dump-tape gate blocked — BTC dump', { coin, tf: '15m' });
        return {
          ok: false,
          reason: `LONG blocked — ${coin} while ${btc15Hit!.replace(/^LONG blocked — /, '')}`,
        };
      }
      if (btc1hDumping) {
        logger.info('Long dump-tape gate blocked — BTC dump', { coin, tf: '1h' });
        return {
          ok: false,
          reason: `LONG blocked — ${coin} while ${btc1hHit!.replace(/^LONG blocked — /, '')}`,
        };
      }
    }

    const hit5 = tapeHit(`${coin} 5m`, c5m, 5);
    if (hit5) {
      logger.info('Long dump-tape gate blocked', { coin, tf: '5m' });
      return { ok: false, reason: hit5 };
    }
    const hit15 = tapeHit(`${coin} 15m`, c15m, 5);
    if (hit15) {
      logger.info('Long dump-tape gate blocked', { coin, tf: '15m' });
      return { ok: false, reason: hit15 };
    }
    const hit1h = tapeHit(`${coin} 1h`, c1h, 5);
    if (hit1h) {
      logger.info('Long dump-tape gate blocked', { coin, tf: '1h' });
      return { ok: false, reason: hit1h };
    }
    const closed4h = c4h.slice(0, -1).slice(-12);
    if (closed4h.length >= 8) {
      const first = closed4h[0]!;
      const last = closed4h[closed4h.length - 1]!;
      const netPct = first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0;
      const lowerHighs =
        closed4h.filter((c, i) => i > 0 && c.high < closed4h[i - 1]!.high).length >=
        Math.ceil(closed4h.length * 0.55);
      if (netPct <= -3 && lowerHighs) {
        const reason = `LONG blocked — ${coin} 4h downtrend (${closed4h.length} bars net ${netPct.toFixed(2)}%, lower highs) — no long into a crash`;
        logger.info('Long dump-tape gate blocked', { coin, tf: '4h' });
        return { ok: false, reason };
      }
    }
    return { ok: true, reason: `Dump-tape OK LONG ${coin}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Long dump-tape gate error — fail closed', { coin, error: msg });
    return {
      ok: false,
      reason: `LONG blocked — ${coin} dump-tape check failed (${msg.slice(0, 60)})`,
    };
  }
}
