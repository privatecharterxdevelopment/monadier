/**
 * Bear-market regime gate.
 *
 * LONGs are only allowed when BOTH majors (BTC + ETH) are clearly UP on BOTH
 * the 15m and 1h timeframes. In every other case the bot is SHORT-only.
 *
 * This is the top-level directional guard the user asked for:
 *   "nur erlauben, wenn BTC und ETH auf 15m + 1h klar UP sind, sonst nur shorts."
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Timeframe } from './signalEngine';

export type BearRegimeVerdict = {
  longsAllowed: boolean;
  reason: string;
  detail: string;
  checkedAt: string;
};

const MAJORS: Array<{ coin: string; symbol: string }> = [
  { coin: 'BTC', symbol: 'BTCUSDT' },
  { coin: 'ETH', symbol: 'ETHUSDT' },
];

const REGIME_TFS: Timeframe[] = ['15m', '1h'];

let cached: BearRegimeVerdict | null = null;
let cachedAt = 0;

function isClearUp(trend: string | undefined | null): boolean {
  const t = String(trend ?? '').toUpperCase();
  return t === 'UP' || t.includes('UPTREND');
}

/**
 * Evaluate the current regime. Cached briefly to avoid hammering the candle API
 * on every scan cycle. Fail-safe: on any error we return longsAllowed=false
 * (SHORT-only) — never accidentally open LONGs when we cannot confirm an uptrend.
 */
export async function evaluateBearMarketRegime(): Promise<BearRegimeVerdict> {
  if (!config.hyperliquid.bearRegime.enabled) {
    return {
      longsAllowed: true,
      reason: 'Bear regime gate disabled',
      detail: 'HL_BEAR_REGIME_ENABLED=false',
      checkedAt: new Date().toISOString(),
    };
  }

  const now = Date.now();
  if (cached && now - cachedAt < config.hyperliquid.bearRegime.cacheMs) {
    return cached;
  }

  try {
    const perMajor = await Promise.all(
      MAJORS.map(async (m) => {
        const signal = await signalEngine.generateSignal(m.symbol, REGIME_TFS);
        const tf15 = signal.timeframes.find((t) => t.timeframe === '15m');
        const tf1h = signal.timeframes.find((t) => t.timeframe === '1h');
        const up15 = isClearUp(tf15?.trend);
        const up1h = isClearUp(tf1h?.trend);
        return {
          coin: m.coin,
          up15,
          up1h,
          bothUp: up15 && up1h,
          label: `${m.coin} 15m ${tf15?.trend ?? '—'} · 1h ${tf1h?.trend ?? '—'}`,
        };
      })
    );

    const allUp = perMajor.every((p) => p.bothUp);
    const detail = perMajor.map((p) => p.label).join(' ‖ ');

    const verdict: BearRegimeVerdict = allUp
      ? {
          longsAllowed: true,
          reason: 'BTC + ETH clearly UP on 15m + 1h — LONGs enabled',
          detail,
          checkedAt: new Date().toISOString(),
        }
      : {
          longsAllowed: false,
          reason: 'Bear/chop regime — SHORT-only (BTC/ETH not clearly UP on 15m + 1h)',
          detail,
          checkedAt: new Date().toISOString(),
        };

    cached = verdict;
    cachedAt = now;
    return verdict;
  } catch (err) {
    // Fail closed → SHORT-only. Better to miss a LONG than to open blind in a dump.
    const verdict: BearRegimeVerdict = {
      longsAllowed: false,
      reason: 'Bear regime check failed — defaulting to SHORT-only',
      detail: err instanceof Error ? err.message : String(err),
      checkedAt: new Date().toISOString(),
    };
    cached = verdict;
    cachedAt = now;
    logger.warn('Bear regime evaluation failed — SHORT-only', {
      error: verdict.detail,
    });
    return verdict;
  }
}

/** Last computed verdict without triggering a fetch (for status endpoints). */
export function getLastBearRegimeVerdict(): BearRegimeVerdict | null {
  return cached;
}
