import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHlAccountState, type HlPosition } from '../lib/hyperliquid/user';

export function useHlOpenPositions(walletAddress: string | undefined) {
  const [positions, setPositions] = useState<HlPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const hasSnapshotRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      hasSnapshotRef.current = false;
      setPositions([]);
      return;
    }
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const acct = await fetchHlAccountState(walletAddress);
      hasSnapshotRef.current = true;
      setPositions(
        acct.positions.filter((p) => Math.abs(Number.parseFloat(p.szi || '0')) > 1e-12)
      );
    } catch {
      // Only keep last snapshot on a true fetch failure — never invent opens.
      if (!hasSnapshotRef.current) setPositions([]);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      hasSnapshotRef.current = false;
      setPositions([]);
      setLoading(false);
      return undefined;
    }
    hasSnapshotRef.current = false;
    setLoading(true);
    void (async () => {
      await refresh();
      setLoading(false);
    })();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [walletAddress, refresh]);

  const livePnlUsd = positions.reduce(
    (sum, p) => sum + (Number.parseFloat(p.unrealizedPnl || '0') || 0),
    0
  );

  return { positions, livePnlUsd, loading: loading && positions.length === 0, refresh };
}
