/**
 * Scalp open gate — 1m + 5m must agree with trade direction (no 1h-only entries).
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type ScalpAlignResult = {
  ok: boolean;
  reason: string;
  tf1m?: string;
  tf5m?: string;
};

function lastNCandlesMove(candles: Candle[], n: number, direction: 'LONG' | 'SHORT'): boolean {
  const closed = candles.slice(-n - 1, -1);
  if (closed.length < n) return false;
  if (direction === 'LONG') {
    return closed.every((c) => c.close >= c.open * 0.9999);
  }
  return closed.every((c) => c.close <= c.open * 1.0001);
}

export async function validateScalpAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<ScalpAlignResult> {
  const cfg = config.hyperliquid.scalpOpen;
  if (!cfg.require1m5mAlign) {
    return { ok: true, reason: 'Scalp align — check disabled' };
  }

  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [tf1m, tf5m, c1m] = await Promise.all([
      signalEngine.analyzeTimeframe(symbol, '1m'),
      signalEngine.analyzeTimeframe(symbol, '5m'),
      signalEngine.fetchCandles(symbol, '1m', 12),
    ]);

    const minConf = cfg.minTfConfidence;
    const label1m = `${tf1m.direction} ${Math.round(tf1m.confidence)}%`;
    const label5m = `${tf5m.direction} ${Math.round(tf5m.confidence)}%`;

    if (tf1m.direction !== opts.direction || tf1m.confidence < minConf) {
      return {
        ok: false,
        reason: `Scalp blocked — ${coin} ${opts.direction} needs 1m aligned (got ${label1m})`,
        tf1m: label1m,
        tf5m: label5m,
      };
    }

    if (tf5m.direction !== opts.direction || tf5m.confidence < minConf) {
      return {
        ok: false,
        reason: `Scalp blocked — ${coin} ${opts.direction} needs 5m aligned (got ${label5m})`,
        tf1m: label1m,
        tf5m: label5m,
      };
    }

    if (!lastNCandlesMove(c1m, cfg.minConfirm1mCandles, opts.direction)) {
      return {
        ok: false,
        reason: `Scalp blocked — ${coin} ${opts.direction} needs ${cfg.minConfirm1mCandles}× 1m candles confirming`,
        tf1m: label1m,
        tf5m: label5m,
      };
    }

    return {
      ok: true,
      reason: `Scalp aligned — ${coin} ${opts.direction} · 1m ${label1m} · 5m ${label5m}`,
      tf1m: label1m,
      tf5m: label5m,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `Scalp align check failed — open blocked (${msg.slice(0, 60)})`,
    };
  }
}
