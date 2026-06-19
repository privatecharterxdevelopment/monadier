import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchHlAccountState, type HlPosition } from '../lib/hyperliquid/user';

export function useHlOpenPositions(walletAddress: string | undefined) {
  const [positions, setPositions] = useState<HlPosition[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setPositions([]);
      return;
    }
    try {
      const acct = await fetchHlAccountState(walletAddress);
      setPositions(
        acct.positions.filter((p) => Math.abs(Number.parseFloat(p.szi || '0')) > 1e-12)
      );
    } catch {
      setPositions([]);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      setPositions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    const id = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [walletAddress, refresh]);

  const livePnlUsd = useMemo(
    () =>
      positions.reduce(
        (sum, p) => sum + (Number.parseFloat(p.unrealizedPnl || '0') || 0),
        0
      ),
    [positions]
  );

  return { positions, livePnlUsd, loading, refresh };
}
