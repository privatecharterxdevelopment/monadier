import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useMonadierWallet } from './useMonadierWallet';
import { fetchUserPositions } from '../lib/userPositions';
import { calcPositionPnl, fetchLiveTokenPrices } from '../lib/positionLivePnl';
import { devWarn } from '../lib/devLog';
import { toNum } from '../lib/hyperliquid/parse';
import { fetchHlAccountState, livePositionUpnl, type HlPosition } from '../lib/hyperliquid/user';

export type BotPositionBadge = {
  count: number;
  netPnl: number;
  tone: 'pos' | 'neg' | null;
  loading: boolean;
};

const EMPTY: BotPositionBadge = { count: 0, netPnl: 0, tone: null, loading: true };

export function useBotPositionBadge(refreshKey = 0) {
  const { address, isConnected } = useMonadierWallet();
  const { isDemoUser, user, isAuthenticated } = useAuth();
  const [badge, setBadge] = useState<BotPositionBadge>(EMPTY);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || (!isDemoUser && !user)) {
      setBadge({ count: 0, netPnl: 0, tone: null, loading: false });
      return;
    }
    if (!isDemoUser && !isConnected) {
      setBadge({ count: 0, netPnl: 0, tone: null, loading: false });
      return;
    }

    try {
      const all = await fetchUserPositions({
        isDemoUser,
        connectedAddress: address,
      });
      const rows = all.filter((p) => p.status === 'open' || p.status === 'closing');
      const prices = await fetchLiveTokenPrices();
      let count = rows.length;
      let netPnl = rows.reduce((sum, row) => sum + calcPositionPnl(row, prices), 0);

      if (!isDemoUser && isConnected && address) {
        const account = await fetchHlAccountState(address);
        const hlOpen = (account.positions ?? []).filter((p) => Math.abs(toNum(p.szi)) > 1e-12);
        if (hlOpen.length > 0) {
          count = Math.max(count, hlOpen.length);
          const hlUpnl = hlOpen.reduce((sum, p: HlPosition) => {
            const mark = prices[p.coin] ?? 0;
            return sum + livePositionUpnl(p, mark);
          }, 0);
          if (rows.length === 0) netPnl = hlUpnl;
        }
      }

      if (count === 0) {
        setBadge({ count: 0, netPnl: 0, tone: null, loading: false });
        return;
      }

      setBadge({
        count,
        netPnl,
        tone: netPnl > 0 ? 'pos' : netPnl < 0 ? 'neg' : null,
        loading: false,
      });
    } catch (e) {
      devWarn('[useBotPositionBadge]', e);
      setBadge((prev) => ({ ...prev, loading: false }));
    }
  }, [address, isConnected, isDemoUser, user, isAuthenticated]);

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
