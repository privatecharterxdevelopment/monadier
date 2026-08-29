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
  // Strict: ≥3/5 red with any net down, or ≥4/5 red, or net ≤ −0.25%.
  if (red >= 4 || (red >= 3 && netPct < -0.08) || netPct <= -0.25) {
    return `LONG blocked — ${label} ${red}/${lookback} red (net ${netPct >= 0 ? '+' : ''}${netPct.toFixed(2)}%) — dump tape, no long into red`;
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
    const [c15m, c1h, c5m, btc15, btc1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', 12),
      signalEngine.fetchCandles(symbol, '1h', 12),
      signalEngine.fetchCandles(symbol, '5m', 16),
      needBtcAnchor
        ? signalEngine.fetchCandles('BTCUSDT', '15m', 12)
        : Promise.resolve([] as Awaited<ReturnType<typeof signalEngine.fetchCandles>>),
      needBtcAnchor
        ? signalEngine.fetchCandles('BTCUSDT', '1h', 12)
        : Promise.resolve([] as Awaited<ReturnType<typeof signalEngine.fetchCandles>>),
    ]);

    if (needBtcAnchor) {
      const btc15Hit = tapeHit('BTC 15m', btc15, 5);
      if (btc15Hit) {
        logger.info('Long dump-tape gate blocked — BTC dump', { coin, tf: '15m' });
        return {
          ok: false,
          reason: `LONG blocked — ${coin} while ${btc15Hit.replace(/^LONG blocked — /, '')}`,
        };
      }
      const btc1hHit = tapeHit('BTC 1h', btc1h, 5);
      if (btc1hHit) {
        logger.info('Long dump-tape gate blocked — BTC dump', { coin, tf: '1h' });
        return {
          ok: false,
          reason: `LONG blocked — ${coin} while ${btc1hHit.replace(/^LONG blocked — /, '')}`,
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
