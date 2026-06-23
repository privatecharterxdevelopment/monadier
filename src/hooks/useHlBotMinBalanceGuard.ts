import { useEffect, useRef } from 'react';
import { disableHlBotExecution, MIN_HL_BOT_USD } from '../lib/hyperliquid/hlBotAgent';

/** Stop HL bot in DB when perp balance drops below minimum — no new trades until deposit. */
export function useHlBotMinBalanceGuard(opts: {
  wallet?: string | null;
  hlBalanceUsd: number;
  autoTradeEnabled: boolean;
  enabled?: boolean;
  onStopped?: () => void;
}): void {
  const stoppingRef = useRef(false);

  useEffect(() => {
    const wallet = opts.wallet?.toLowerCase();
    if (!opts.enabled || !wallet) return;

    if (!opts.autoTradeEnabled || opts.hlBalanceUsd >= MIN_HL_BOT_USD) {
      stoppingRef.current = false;
      return;
    }

    if (stoppingRef.current) return;
    stoppingRef.current = true;

    void disableHlBotExecution(wallet)
      .then(() => opts.onStopped?.())
      .catch((err: unknown) => {
        stoppingRef.current = false;
        console.warn('[useHlBotMinBalanceGuard] disable failed', err);
      });
  }, [
    opts.wallet,
    opts.hlBalanceUsd,
    opts.autoTradeEnabled,
    opts.enabled,
    opts.onStopped,
  ]);
}
