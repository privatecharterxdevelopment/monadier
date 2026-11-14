import { fetchHlClearinghouseState } from './hlInfo';
import { cancelProfitStopsForLetRun } from './hlProfitStopSync';
import { deleteDynamicTrailRecord } from './profitTrailState';
import { logger } from '../utils/logger';

/** When user enables Let run: remove exchange profit-SL so HL cannot auto-close. */
export async function applyLetRunHoldSideEffects(
  wallet: `0x${string}`,
  coin: string
): Promise<void> {
  const ck = coin.trim().toUpperCase();
  if (!ck) return;
  try {
    const state = await fetchHlClearinghouseState(wallet, { forceRefresh: true });
    for (const asset of state?.assetPositions ?? []) {
      const pos = asset.position;
      if (!pos || String(pos.coin ?? '').toUpperCase() !== ck) continue;
      const size = Number(pos.szi ?? 0);
      const entry = Number(pos.entryPx ?? 0);
      if (!Number.isFinite(size) || Math.abs(size) < 1e-12 || !(entry > 0)) continue;
      const direction: 'LONG' | 'SHORT' = size > 0 ? 'LONG' : 'SHORT';
      const cancelled = await cancelProfitStopsForLetRun({
        userAddress: wallet,
        coin: ck,
        direction,
        entryPx: entry,
      });
      deleteDynamicTrailRecord(`${wallet.toLowerCase()}:${ck}`);
      logger.info('HL let-run ON — hold side effects applied', {
        user: wallet.slice(0, 10),
        coin: ck,
        profitStopsCancelled: cancelled,
      });
      return;
    }
    deleteDynamicTrailRecord(`${wallet.toLowerCase()}:${ck}`);
    logger.info('HL let-run ON — prefs saved (no open size on HL)', {
      user: wallet.slice(0, 10),
      coin: ck,
    });
  } catch (err) {
    logger.warn('HL let-run hold side effects failed', {
      user: wallet.slice(0, 10),
      coin: ck,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}