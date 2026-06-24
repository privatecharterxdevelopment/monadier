import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useAuth } from '../contexts/AuthContext';
import { fetchUserPositions } from '../lib/userPositions';
import { calcPositionPnl, fetchLiveTokenPrices } from '../lib/positionLivePnl';
import { devWarn } from '../lib/devLog';

export type BotPositionBadge = {
  count: number;
  netPnl: number;
  tone: 'pos' | 'neg' | null;
  loading: boolean;
};

const EMPTY: BotPositionBadge = { count: 0, netPnl: 0, tone: null, loading: true };

export function useBotPositionBadge(refreshKey = 0) {
  const { address } = useAccount();
  const { isDemoUser } = useAuth();
  const [badge, setBadge] = useState<BotPositionBadge>(EMPTY);

  const refresh = useCallback(async () => {
    try {
      const all = await fetchUserPositions({
        isDemoUser,
        connectedAddress: address,
      });
      const rows = all.filter((p) => p.status === 'open' || p.status === 'closing');
      if (rows.length === 0) {
        setBadge({ count: 0, netPnl: 0, tone: null, loading: false });
        return;
      }

      const prices = await fetchLiveTokenPrices();
      const netPnl = rows.reduce((sum, row) => sum + calcPositionPnl(row, prices), 0);
      const count = rows.length;

      setBadge({
        count,
        netPnl,
        tone: count > 0 ? (netPnl >= 0 ? 'pos' : 'neg') : null,
        loading: false,
      });
    } catch (e) {
      devWarn('[useBotPositionBadge]', e);
      setBadge((prev) => ({ ...prev, loading: false }));
    }
  }, [address, isDemoUser]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { badge, refresh };
}
