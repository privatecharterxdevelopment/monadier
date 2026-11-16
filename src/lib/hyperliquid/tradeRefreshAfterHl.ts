import type { HlAccountRefreshOpts } from '../../hooks/useHyperliquidAccount';
import { clearHlUserInfoCache } from './hlInfoClient';
import { requestTradeNotificationRefresh } from '../tradeNotificationEvents';

export type HlTradeRefreshHandlers = {
  refreshAccount?: (opts?: HlAccountRefreshOpts) => Promise<void>;
  refreshHlSnap?: (fresh?: boolean) => Promise<void>;
};

/** Bust HL caches and pull fresh positions/fills immediately after open or close. */
export async function flushHlStateAfterTrade(
  wallet: string | undefined,
  handlers: HlTradeRefreshHandlers,
  opts?: { afterClose?: boolean }
): Promise<void> {
  const w = wallet?.toLowerCase();
  if (w) {
    clearHlUserInfoCache(w);
  }
  requestTradeNotificationRefresh();
  const afterClose = opts?.afterClose === true;
  // Close: light poll first — avoid 6× parallel /info right when HL is hot.
  await Promise.all([
    handlers.refreshAccount?.({ forceHeavy: !afterClose }) ?? Promise.resolve(),
    handlers.refreshHlSnap?.(!afterClose) ?? Promise.resolve(),
  ]);
  if (afterClose) {
    window.setTimeout(() => {
      void handlers.refreshAccount?.();
      void handlers.refreshHlSnap?.(true);
    }, 2_500);
    window.setTimeout(() => {
      void handlers.refreshAccount?.({ forceHeavy: true });
    }, 6_000);
    return;
  }
  window.setTimeout(() => {
    void handlers.refreshAccount?.({ forceHeavy: true });
    void handlers.refreshHlSnap?.(true);
  }, 350);
}

/** Background refresh — never block the Close click handler on network. */
export function scheduleHlStateAfterTrade(
  wallet: string | undefined,
  handlers: HlTradeRefreshHandlers,
  opts?: { afterClose?: boolean }
): void {
  const delayMs = opts?.afterClose ? 450 : 0;
  window.setTimeout(() => {
    void flushHlStateAfterTrade(wallet, handlers, opts).catch(() => undefined);
  }, delayMs);
}