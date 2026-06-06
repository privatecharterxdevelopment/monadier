import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAccount } from 'wagmi';
import { useAuth, DEMO_WALLET_ADDRESS } from './AuthContext';
import { supabase } from '../lib/supabase';
import { fetchUserWalletAddresses } from '../lib/userWallets';
import {
  type ClosedTradeRow,
  fetchClosedTradesForWallets,
  isTradeUnread,
  loadLastSeenAt,
  saveLastSeenAt,
  storageKeyForUser,
} from '../lib/closedTrades';
import { useTermAuthToast } from '../components/terminal/TermAuthToast';

type TradeNotificationsContextValue = {
  trades: ClosedTradeRow[];
  unreadCount: number;
  isLoading: boolean;
  refresh: () => void;
  markAllRead: () => void;
  markReadThrough: (closedAt: string) => void;
  isUnread: (trade: ClosedTradeRow) => boolean;
};

const TradeNotificationsContext = createContext<TradeNotificationsContextValue | null>(
  null
);

export function useTradeNotifications(): TradeNotificationsContextValue {
  const ctx = useContext(TradeNotificationsContext);
  if (!ctx) {
    throw new Error('useTradeNotifications requires TradeNotificationsProvider');
  }
  return ctx;
}

export const TradeNotificationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { address } = useAccount();
  const { user, isDemoUser } = useAuth();
  const { showToast } = useTermAuthToast();
  const [trades, setTrades] = useState<ClosedTradeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const storageKey = storageKeyForUser(user?.id, isDemoUser);

  useEffect(() => {
    setLastSeenAt(loadLastSeenAt(storageKey));
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchUserWalletAddresses(address, isDemoUser);
      if (!cancelled) setWallets(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isDemoUser]);

  const load = useCallback(
    async (silent = false) => {
      const queryWallets =
        wallets.length > 0 ? wallets : isDemoUser ? [DEMO_WALLET_ADDRESS] : [];

      if (queryWallets.length === 0) {
        setTrades([]);
        setIsLoading(false);
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        const rows = await fetchClosedTradesForWallets(queryWallets, 100);
        const prevIds = knownIdsRef.current;
        if (silent && prevIds.size > 0) {
          const fresh = rows.find((r) => !prevIds.has(r.id));
          if (fresh) {
            const pl = fresh.profitLoss;
            const sign = pl >= 0 ? '+' : '';
            showToast(
              `Trade closed · ${fresh.direction} ${fresh.tokenSymbol} ${sign}$${Math.abs(pl).toFixed(2)}`,
              3200
            );
          }
        }
        knownIdsRef.current = new Set(rows.map((r) => r.id));
        setTrades(rows);
      } catch (e) {
        console.error('[TradeNotifications]', e);
        if (!silent) setTrades([]);
      } finally {
        setIsLoading(false);
      }
    },
    [address, isDemoUser, wallets, showToast]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const poll = setInterval(() => load(true), 12000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (wallets.length === 0 && !isDemoUser && !address) return;

    const channel = supabase
      .channel(`trade-notif-${user?.id || address || 'guest'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_history' },
        () => load(true)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'positions' },
        () => load(true)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [wallets, address, isDemoUser, user?.id, load]);

  const markAllRead = useCallback(() => {
    const latest = trades[0]?.closedAt ?? new Date().toISOString();
    saveLastSeenAt(storageKey, latest);
    setLastSeenAt(latest);
  }, [trades, storageKey]);

  const markReadThrough = useCallback(
    (closedAt: string) => {
      const current = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
      const next = new Date(closedAt).getTime();
      if (next > current) {
        saveLastSeenAt(storageKey, closedAt);
        setLastSeenAt(closedAt);
      }
    },
    [lastSeenAt, storageKey]
  );

  const isUnread = useCallback(
    (trade: ClosedTradeRow) => isTradeUnread(trade, lastSeenAt),
    [lastSeenAt]
  );

  const unreadCount = useMemo(
    () => trades.filter((t) => isTradeUnread(t, lastSeenAt)).length,
    [trades, lastSeenAt]
  );

  const value = useMemo(
    () => ({
      trades,
      unreadCount,
      isLoading,
      refresh: () => load(true),
      markAllRead,
      markReadThrough,
      isUnread,
    }),
    [trades, unreadCount, isLoading, load, markAllRead, markReadThrough, isUnread]
  );

  return (
    <TradeNotificationsContext.Provider value={value}>
      {children}
    </TradeNotificationsContext.Provider>
  );
};
