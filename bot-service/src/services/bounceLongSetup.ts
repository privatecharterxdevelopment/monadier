/**
 * High-precision bounce LONG detector — dump into swing-low → impulse greens.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import {
  evaluateBounceLongFromCandles,
  isImpulseBounceLongCandles,
  type BounceLongSetup,
  type BounceLongGrade,
} from './bounceLongCandles';

export type { BounceLongSetup, BounceLongGrade };
export { evaluateBounceLongFromCandles, isImpulseBounceLongCandles };

/** Live HL coin → high-precision bounce LONG setup (15m primary). */
export async function evaluateBounceLongSetup(coin: string): Promise<BounceLongSetup> {
  const symbol = hlCoinToBinanceSymbol(coin);
  const cfg = config.hyperliquid.preferLongAfterDump;
  try {
    const c15m = await signalEngine.fetchCandles(
      symbol,
      '15m',
      Math.max(28, cfg.swingLookback15m + 8)
    );
    const setup = evaluateBounceLongFromCandles(c15m);
    if (setup.ok) {
      logger.info('Precision bounce LONG detected', {
        coin: coin.toUpperCase(),
        grade: setup.grade,
        bouncePct: setup.bouncePct.toFixed(2),
        dumpPct: setup.dumpPct.toFixed(2),
        barsSinceLow: setup.barsSinceLow,
      });
    }
    return setup;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('Bounce LONG eval skipped', { coin, error: msg.slice(0, 80) });
    return {
      ok: false,
      grade: null,
      confidence: 0,
      reason: null,
      bouncePct: 0,
      dumpPct: 0,
      barsSinceLow: 99,
      nearLowPct: 99,
    };
  }
}
