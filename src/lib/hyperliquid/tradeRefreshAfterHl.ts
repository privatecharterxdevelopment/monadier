import type { HlAccountRefreshOpts } from '../../hooks/useHyperliquidAccount';
import { clearHlInfoCache, clearHlUserInfoCache } from './hlInfoClient';
import { requestTradeNotificationRefresh } from '../tradeNotificationEvents';

export type HlTradeRefreshHandlers = {
  refreshAccount?: (opts?: HlAccountRefreshOpts) => Promise<void>;
  refreshHlSnap?: (fresh?: boolean) => Promise<void>;
};

/** Bust HL caches and pull fresh positions/fills immediately after open or close. */
export async function flushHlStateAfterTrade(
  wallet: string | undefined,
  handlers: HlTradeRefreshHandlers
): Promise<void> {
  const w = wallet?.toLowerCase();
  if (w) {
    clearHlUserInfoCache(w);
  }
  clearHlInfoCache();
  requestTradeNotificationRefresh();
  await Promise.all([
    handlers.refreshAccount?.({ forceHeavy: true }) ?? Promise.resolve(),
    handlers.refreshHlSnap?.(true) ?? Promise.resolve(),
  ]);
  window.setTimeout(() => {
    void handlers.refreshAccount?.({ forceHeavy: true });
    void handlers.refreshHlSnap?.(true);
  }, 350);
}

/** Background refresh — never block the Close click handler on network. */
export function scheduleHlStateAfterTrade(
  wallet: string | undefined,
  handlers: HlTradeRefreshHandlers
): void {
  void flushHlStateAfterTrade(wallet, handlers).catch(() => undefined);
}