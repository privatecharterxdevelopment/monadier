import { useEffect, useRef } from 'react';
import { MIN_HL_BOT_USD } from '../lib/hyperliquid/hlBotAgent';

/** Warn when HL balance is below minimum — never flips auto_trade off (user presses Stop). */
export function useHlBotMinBalanceGuard(opts: {
  wallet?: string | null;
  hlBalanceUsd: number;
  spotUsdcUsd?: number;
  autoTradeEnabled: boolean;
  enabled?: boolean;
  /** @deprecated Use onLowBalance — kept for callers */
  onStopped?: () => void;
  onLowBalance?: () => void;
}): void {
  const warnedRef = useRef(false);

  useEffect(() => {
    const wallet = opts.wallet?.toLowerCase();
    if (!opts.enabled || !wallet) return;

    const spotUsd = opts.spotUsdcUsd ?? 0;
    const funded =
      opts.hlBalanceUsd >= MIN_HL_BOT_USD || spotUsd >= MIN_HL_BOT_USD;

    if (!opts.autoTradeEnabled || funded) {
      warnedRef.current = false;
      return;
    }

    if (warnedRef.current) return;
    warnedRef.current = true;

    const notify = opts.onLowBalance ?? opts.onStopped;
    notify?.();
  }, [
    opts.wallet,
    opts.hlBalanceUsd,
    opts.spotUsdcUsd,
    opts.autoTradeEnabled,
    opts.enabled,
    opts.onStopped,
    opts.onLowBalance,
  ]);
}
