import { useCallback, useEffect, useState } from 'react';
import {
  confirmPlatformFeePayment,
  fetchPlatformFees,
  type PlatformFeeStatus,
  type PlatformFeeTrade,
} from '../lib/platformFeesApi';

export function usePlatformFees(wallet?: string | null, enabled = true) {
  const [status, setStatus] = useState<PlatformFeeStatus | null>(null);
  const [trades, setTrades] = useState<PlatformFeeTrade[]>([]);
  const [treasuryAddress, setTreasuryAddress] = useState<string>('');
  const [builderAddress, setBuilderAddress] = useState<string>('');
  const [winsBeforeBlock, setWinsBeforeBlock] = useState(20);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const w = wallet?.trim().toLowerCase();
    if (!w || !enabled) {
      setStatus(null);
      setTrades([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchPlatformFees(w);
      if (data?.success) {
        setStatus(data.status);
        setTrades(data.trades ?? []);
        setTreasuryAddress(data.treasuryAddress ?? data.builderAddress ?? '');
        setBuilderAddress(data.builderAddress ?? '');
        setWinsBeforeBlock(data.winsBeforeBlock ?? 20);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet, enabled]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const confirmPayment = useCallback(
    async (amountUsd: number, paymentRef?: string) => {
      const w = wallet?.trim().toLowerCase();
      if (!w) return false;
      const result = await confirmPlatformFeePayment({
        wallet: w,
        amountUsd,
        paymentRef,
      });
      if (result.status) setStatus(result.status);
      await refresh();
      return result.success;
    },
    [wallet, refresh]
  );

  return {
    status,
    trades,
    builderAddress,
    treasuryAddress,
    winsBeforeBlock,
    loading,
    refresh,
    confirmPayment,
    accruedUsd: status?.accruedUsd ?? 0,
    opensBlocked: status?.opensBlocked ?? false,
    withdrawBlocked: status?.withdrawBlocked ?? false,
    successWinCount: status?.successWinCount ?? 0,
    winsUntilBlock: status?.winsUntilBlock ?? 20,
  };
}
