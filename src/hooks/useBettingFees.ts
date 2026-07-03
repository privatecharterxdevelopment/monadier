import { useCallback, useEffect, useState } from 'react';
import {
  confirmBettingFeePayment,
  fetchBettingFees,
  type BettingFeeEvent,
  type BettingFeeStatus,
} from '../lib/betting/bettingFeesApi';

const EMPTY_STATUS: BettingFeeStatus = {
  accruedUsd: 0,
  settledUsd: 0,
  successWinCount: 0,
  winsBeforeBlock: 1,
  winsUntilBlock: 1,
  bettingBlocked: false,
  withdrawBlocked: false,
  buyFeeBps: 50,
  cashoutFeeBps: 250,
};

export function useBettingFees(wallet: string | null | undefined, enabled = true) {
  const [status, setStatus] = useState<BettingFeeStatus>(EMPTY_STATUS);
  const [events, setEvents] = useState<BettingFeeEvent[]>([]);
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<BettingFeeStatus> => {
    if (!enabled || !wallet) {
      setStatus(EMPTY_STATUS);
      setEvents([]);
      return EMPTY_STATUS;
    }
    setLoading(true);
    try {
      const json = await fetchBettingFees(wallet);
      if (json?.success) {
        const next = json.status ?? EMPTY_STATUS;
        setStatus(next);
        setEvents(json.events ?? []);
        setTreasuryAddress(json.treasuryAddress ?? '');
        return next;
      }
    } finally {
      setLoading(false);
    }
    return EMPTY_STATUS;
  }, [enabled, wallet]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const confirmPayment = useCallback(
    async (amountUsd: number, paymentRef?: string) => {
      if (!wallet) return false;
      const result = await confirmBettingFeePayment({
        wallet,
        amountUsd,
        paymentRef,
      });
      if (result.status) setStatus(result.status);
      if (result.success) await refresh();
      return result.success;
    },
    [wallet, refresh]
  );

  return {
    status,
    events,
    treasuryAddress,
    loading,
    refresh,
    confirmPayment,
  };
}
