/**
 * Skip pairs that just pumped — mass alts often retest highs before rolling over.
 * Applies to both LONG and SHORT until cooldown expires.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { needsCautionPath, type CoinTier } from './coinTier';

export type FreshPumpResult = {
  ok: boolean;
  reason: string;
  skipUntil?: number;
};

const skipUntilByCoin = new Map<string, number>();

function pctChangeClosed(candles: Candle[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function rangeHighPosition(candles: Candle[]): number {
  const closed = candles.slice(-24, -1);
  if (closed.length < 4) return 0.5;
  const price = closed[closed.length - 1]?.close ?? 0;
  const hi = Math.max(...closed.map((c) => c.high));
  const lo = Math.min(...closed.map((c) => c.low));
  const span = hi - lo;
  if (span <= 0 || price <= 0) return 0.5;
  return (price - lo) / span;
}

export async function validateNotFreshlyPumped(opts: {
  coin: string;
  tier: CoinTier;
}): Promise<FreshPumpResult> {
  const coin = opts.coin.toUpperCase();

  const now = Date.now();
  const cachedUntil = skipUntilByCoin.get(coin);
  if (cachedUntil && now < cachedUntil) {
    const waitMin = Math.ceil((cachedUntil - now) / 60_000);
    return {
      ok: false,
      reason: `Pair skipped — ${coin} in post-pump cooldown (~${waitMin}m left); wait for pullback`,
      skipUntil: cachedUntil,
    };
  }

  const cfg = config.hyperliquid.freshPump;
  const strict = needsCautionPath(opts.tier);
  const major = opts.tier === 'major';
  const block1h = major ? cfg.midBlock1hPct : strict ? cfg.cautiousBlock1hPct : cfg.midBlock1hPct;
  const block4h = major ? cfg.midBlock4hPct : strict ? cfg.cautiousBlock4hPct : cfg.midBlock4hPct;
  const block15m = major ? cfg.midBlock15mPct : strict ? cfg.cautiousBlock15mPct : cfg.midBlock15mPct;
  const nearHigh = major ? cfg.midNearRangeHigh : strict ? cfg.cautiousNearRangeHigh : cfg.midNearRangeHigh;

  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const [c15m, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', 20),
      signalEngine.fetchCandles(symbol, '1h', 12),
    ]);

    const ch15m = pctChangeClosed(c15m, 1);
    const ch1h = pctChangeClosed(c1h, 1);
    const ch4h = pctChangeClosed(c1h, 4);
    const pos = rangeHighPosition(c1h);

    const fatPump =
      ch15m >= block15m ||
      ch1h >= block1h ||
      ch4h >= block4h ||
      (ch1h > 0 && pos >= nearHigh);

    if (!fatPump) {
      skipUntilByCoin.delete(coin);
      return {
        ok: true,
        reason: `No fresh pump — ${coin} (15m ${ch15m >= 0 ? '+' : ''}${ch15m.toFixed(2)}%, 1h ${ch1h >= 0 ? '+' : ''}${ch1h.toFixed(2)}%)`,
      };
    }

    const until = now + cfg.cooldownMs;
    skipUntilByCoin.set(coin, until);
    const reason =
      `Pair skipped — ${coin} just pumped (15m ${ch15m >= 0 ? '+' : ''}${ch15m.toFixed(2)}%, ` +
      `1h ${ch1h >= 0 ? '+' : ''}${ch1h.toFixed(2)}%, 4h ${ch4h >= 0 ? '+' : ''}${ch4h.toFixed(2)}%, ` +
      `range ${(pos * 100).toFixed(0)}%) — mass alts often retest highs; waiting ${Math.round(cfg.cooldownMs / 60_000)}m`;
    logger.info('Fresh pump skip', { coin, ch15m, ch1h, ch4h, pos, until });
    return { ok: false, reason, skipUntil: until };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (strict) {
      return {
        ok: false,
        reason: `Pair skipped — ${coin} pump check failed (${msg.slice(0, 50)}); cautious alts need clear data`,
      };
    }
    return { ok: true, reason: `Pump check skipped — ${coin} (${msg.slice(0, 40)})` };
  }
}
