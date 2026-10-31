/**
 * Optional per-direction entry-trend gate from HlDirectionRules.
 *
 * Only runs when `required5mTrend` / `required15mTrend` / `minConfirm15mCandles`
 * are set on that side's rules (bear_market LONG: 5m + 15m UP).
 * SHORT / unset rules → always pass (unchanged).
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type ProfileEntryTrendResult = {
  ok: boolean;
  reason: string;
  trend5m?: string;
  trend15m?: string;
};

function lastNClosedConfirm(
  candles: Candle[],
  n: number,
  side: 'UP' | 'DOWN'
): boolean {
  const closed = candles.slice(-n - 1, -1);
  if (closed.length < n) return false;
  if (side === 'UP') {
    return closed.every((c) => c.close >= c.open * 0.9999);
  }
  return closed.every((c) => c.close <= c.open * 1.0001);
}

function trendMatches(raw: string | undefined, required: 'UP' | 'DOWN'): boolean {
  const t = String(raw ?? '').toUpperCase();
  if (!t) return false;
  if (required === 'UP') {
    return t === 'UP' || t.includes('UP') || t.includes('LONG') || t === 'STRONG_UPTREND';
  }
  return t === 'DOWN' || t.includes('DOWN') || t.includes('SHORT') || t === 'STRONG_DOWNTREND';
}

/** Finger weg: any DOWN / bearish label when UP is required. */
function isGoingDown(raw: string | undefined): boolean {
  const t = String(raw ?? '').toUpperCase();
  if (!t) return false;
  return (
    t === 'DOWN' ||
    t.includes('DOWN') ||
    t.includes('SHORT') ||
    t === 'STRONG_DOWNTREND'
  );
}

export async function validateProfileEntryTrend(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<ProfileEntryTrendResult> {
  const rules =
    opts.direction === 'LONG'
      ? config.hyperliquid.directionProfile.long
      : config.hyperliquid.directionProfile.short;

  const required5 = rules.required5mTrend ?? null;
  const required15 = rules.required15mTrend ?? null;
  const minCandles = Math.max(0, Math.floor(rules.minConfirm15mCandles ?? 0));
  if (!required5 && !required15 && minCandles <= 0) {
    return { ok: true, reason: 'Profile entry-trend — not configured for this side' };
  }

  const symbol = hlCoinToBinanceSymbol(opts.coin.toUpperCase());
  try {
    const need = Math.max(minCandles + 2, 8);
    const [tf5, tf15, candles15] = await Promise.all([
      required5 ? signalEngine.analyzeTimeframe(symbol, '5m') : Promise.resolve(null),
      required15 || minCandles > 0
        ? signalEngine.analyzeTimeframe(symbol, '15m')
        : Promise.resolve(null),
      minCandles > 0 && required15
        ? signalEngine.fetchCandles(symbol, '15m', need)
        : Promise.resolve([] as Candle[]),
    ]);

    const trend5m = tf5?.trend;
    const trend15m = tf15?.trend;

    if (required5) {
      if (isGoingDown(trend5m) || !trendMatches(trend5m, required5)) {
        return {
          ok: false,
          reason: `${opts.direction} blocked — 5m trend ${trend5m ?? 'n/a'} (need ${required5}; finger weg if 5m down)`,
          trend5m,
          trend15m,
        };
      }
    }

    if (required15) {
      if (isGoingDown(trend15m) || !trendMatches(trend15m, required15)) {
        return {
          ok: false,
          reason: `${opts.direction} blocked — 15m trend ${trend15m ?? 'n/a'} (need ${required15}; finger weg if 15m down)`,
          trend5m,
          trend15m,
        };
      }
    }

    if (minCandles > 0 && required15) {
      if (!lastNClosedConfirm(candles15, minCandles, required15)) {
        return {
          ok: false,
          reason: `${opts.direction} blocked — need ${minCandles} closed 15m ${required15 === 'UP' ? 'green' : 'red'} candles`,
          trend5m,
          trend15m,
        };
      }
    }

    const parts: string[] = [];
    if (trend5m) parts.push(`5m ${trend5m}`);
    if (trend15m) parts.push(`15m ${trend15m}`);
    if (minCandles > 0) parts.push(`${minCandles} candle confirm`);

    return {
      ok: true,
      reason: parts.join(' · ') || 'entry-trend ok',
      trend5m,
      trend15m,
    };
  } catch {
    return {
      ok: false,
      reason: `${opts.direction} blocked — entry-trend check failed`,
    };
  }
}
