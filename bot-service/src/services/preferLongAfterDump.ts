/**
 * Prefer LONG after a sharp dump near swing-low (bounce setups).
 * Boosts LONG confidence only — never overrides SHORT scoring or blocks SHORT opens.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { evaluateBounceLongSetup, type BounceLongSetup } from './bounceLongSetup';

export type PreferLongBoost = {
  boostConfidence: number;
  reason: string | null;
  setup: BounceLongSetup | null;
};

/** LONG-only scan boost near dump bottoms. SHORT → no change. */
export async function preferLongAfterDumpBoost(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT' | 'HOLD';
}): Promise<PreferLongBoost> {
  const coin = opts.coin.toUpperCase();
  const cfg = config.hyperliquid.preferLongAfterDump;

  if (opts.direction !== 'LONG') {
    return { boostConfidence: 0, reason: null, setup: null };
  }

  try {
    const setup = await evaluateBounceLongSetup(coin);
    if (!setup.ok || !setup.grade) {
      return { boostConfidence: 0, reason: null, setup, };
    }

    const boost = cfg.confidenceBoost + (setup.grade === 'impulse' ? 4 : 0);
    logger.info('Prefer-LONG dump bounce boost', {
      coin,
      grade: setup.grade,
      boost,
      bounce: setup.bouncePct,
    });
    return {
      boostConfidence: boost,
      reason: setup.reason,
      setup,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('Prefer-LONG dump boost skipped', { coin, error: msg.slice(0, 80) });
    return { boostConfidence: 0, reason: null, setup: null };
  }
}
