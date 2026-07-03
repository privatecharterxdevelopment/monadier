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
  bettingBlocked: false,
  buyFeeBps: 50,
  cashoutFeeBps: 250,
};

export function useBettingFees(wallet: string | null | undefined, enabled = true) {
  const [status, setStatus] = useState<BettingFeeStatus>(EMPTY_STATUS);
  const [events, setEvents] = useState<BettingFeeEvent[]>([]);
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !wallet) {
      setStatus(EMPTY_STATUS);
      setEvents([]);
      return;
    }
    setLoading(true);
    try {
      const json = await fetchBettingFees(wallet);
      if (json?.success) {
        setStatus(json.status ?? EMPTY_STATUS);
        setEvents(json.events ?? []);
        setTreasuryAddress(json.treasuryAddress ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, wallet]);

  useEffect(() => {
    void refresh();
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
