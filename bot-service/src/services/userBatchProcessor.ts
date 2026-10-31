import { config } from '../config';
import { logger } from '../utils/logger';
import { mapPool } from '../utils/asyncPool';
import type { TradingCycleContext } from './tradingCycleContext';
import { hyperliquidTradingService } from './hlTrading';

let roundRobinOffset = 0;

export function sliceUsersForCycle(allWallets: string[]): {
  wallets: string[];
  total: number;
  offset: number;
} {
  const total = allWallets.length;
  const max = config.scaling.maxUsersPerCycle;

  if (max <= 0 || total <= max) {
    return { wallets: allWallets, total, offset: 0 };
  }

  const start = roundRobinOffset % total;
  const end = start + max;
  roundRobinOffset = end % total;

  const wallets =
    end <= total
      ? allWallets.slice(start, end)
      : [...allWallets.slice(start), ...allWallets.slice(0, end % total)];

  return { wallets, total, offset: start };
}

export type BatchProcessStats = {
  totalActive: number;
  processed: number;
  offset: number;
  succeeded: number;
  skipped: number;
  failed: number;
  ms: number;
};

/** Process wallets in parallel batches using precomputed cycle context. */
export async function processUserBatch(
  wallets: string[],
  ctx: TradingCycleContext,
  totalActiveBots: number
): Promise<BatchProcessStats> {
  const started = Date.now();
  const concurrency = config.scaling.userProcessConcurrency;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  await mapPool(wallets, concurrency, async (wallet) => {
    try {
      const result = await hyperliquidTradingService.processUser(
        wallet as `0x${string}`,
        ctx
      );
      if (result === 'ok') succeeded += 1;
      else if (result === 'skip') skipped += 1;
      else failed += 1;
    } catch (err: unknown) {
      failed += 1;
      logger.warn('User process error', {
        user: wallet.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const stats: BatchProcessStats = {
    totalActive: totalActiveBots,
    processed: wallets.length,
    offset: 0,
    succeeded,
    skipped,
    failed,
    ms: Date.now() - started,
  };

  logger.info('User batch complete', stats);
  return stats;
}
