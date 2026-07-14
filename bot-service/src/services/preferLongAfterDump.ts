/**
 * Prefer LONG after a sharp dump near swing-low (bounce setups).
 * Boosts LONG confidence; impulse setups can manufacture a LONG candidate.
 * Never blocks SHORT opens.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { evaluateBounceLongSetup, type BounceLongSetup } from './bounceLongSetup';

export type PreferLongBoost = {
  boostConfidence: number;
  reason: string | null;
  setup: BounceLongSetup | null;
  /** True → scan may inject/override a LONG candidate for this coin. */
  forceLongCandidate: boolean;
};

/** LONG-only scan boost / candidate near dump bottoms. SHORT → no change. */
export async function preferLongAfterDumpBoost(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT' | 'HOLD';
  confidence?: number;
}): Promise<PreferLongBoost> {
  const coin = opts.coin.toUpperCase();
  const cfg = config.hyperliquid.preferLongAfterDump;
  const priorConf = opts.confidence ?? 0;

  try {
    const setup = await evaluateBounceLongSetup(coin);
    if (!setup.ok || !setup.grade) {
      return { boostConfidence: 0, reason: null, setup, forceLongCandidate: false };
    }

    if (opts.direction === 'LONG') {
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
        forceLongCandidate: false,
      };
    }

    // Precision: only override HOLD or weak SHORT — never a strong aligned short.
    const weakPrior =
      opts.direction === 'HOLD' ||
      priorConf < 62 ||
      (setup.grade === 'impulse' && priorConf < 72);
    if (!weakPrior) {
      return { boostConfidence: 0, reason: null, setup, forceLongCandidate: false };
    }

    logger.info('Prefer-LONG force candidate from bounce setup', {
      coin,
      grade: setup.grade,
      priorDirection: opts.direction,
      priorConf,
      bounce: setup.bouncePct,
    });
    return {
      boostConfidence: 0,
      reason: setup.reason,
      setup,
      forceLongCandidate: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('Prefer-LONG dump boost skipped', { coin, error: msg.slice(0, 80) });
    return { boostConfidence: 0, reason: null, setup: null, forceLongCandidate: false };
  }
}
