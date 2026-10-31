import { useCallback, useEffect, useState } from 'react';
import {
  fetchMultiChainUsdcBalances,
  sumNonArbitrumUsdc,
  type UsdcChainBalance,
} from '../lib/usdcMultichain';

export function useMultiChainUsdcBalances(walletAddress: string | undefined) {
  const [rows, setRows] = useState<UsdcChainBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchMultiChainUsdcBalances(walletAddress);
      setRows(next);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    rows,
    loading,
    refresh,
    strandedUsdc: sumNonArbitrumUsdc(rows),
  };
}
