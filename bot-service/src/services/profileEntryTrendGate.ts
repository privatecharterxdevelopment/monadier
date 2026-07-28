/**
 * Optional per-direction entry-trend gate from HlDirectionRules.
 *
 * Only runs when `required15mTrend` / `minConfirm15mCandles` are set on that
 * side's rules (bear_market LONG). SHORT / unset rules → always pass.
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type ProfileEntryTrendResult = {
  ok: boolean;
  reason: string;
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

export async function validateProfileEntryTrend(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<ProfileEntryTrendResult> {
  const rules =
    opts.direction === 'LONG'
      ? config.hyperliquid.directionProfile.long
      : config.hyperliquid.directionProfile.short;

  const required15 = rules.required15mTrend ?? null;
  const minCandles = Math.max(0, Math.floor(rules.minConfirm15mCandles ?? 0));
  if (!required15 && minCandles <= 0) {
    return { ok: true, reason: 'Profile entry-trend — not configured for this side' };
  }

  const symbol = hlCoinToBinanceSymbol(opts.coin.toUpperCase());
  try {
    const need = Math.max(minCandles + 2, 8);
    const [tf15, candles] = await Promise.all([
      signalEngine.analyzeTimeframe(symbol, '15m'),
      signalEngine.fetchCandles(symbol, '15m', need),
    ]);
    const trend15m = tf15?.trend ?? 'SIDEWAYS';

    if (required15 && !trendMatches(trend15m, required15)) {
      return {
        ok: false,
        reason: `${opts.direction} blocked — 15m trend ${trend15m} (need ${required15})`,
        trend15m,
      };
    }

    if (minCandles > 0 && required15) {
      if (!lastNClosedConfirm(candles, minCandles, required15)) {
        return {
          ok: false,
          reason: `${opts.direction} blocked — need ${minCandles} closed 15m ${required15 === 'UP' ? 'green' : 'red'} candles`,
          trend15m,
        };
      }
    }

    return {
      ok: true,
      reason: `15m ${trend15m}${minCandles > 0 ? ` · ${minCandles} candle confirm` : ''}`,
      trend15m,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `${opts.direction} blocked — 15m entry-trend check failed`,
    };
  }
}
