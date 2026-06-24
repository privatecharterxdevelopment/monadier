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
import { ensureArray } from '../lib/ensureArray';
import { supabase } from '../lib/supabase';
import { fetchUserWalletAddresses } from '../lib/userWallets';
import {
  fetchClosedTrades,
  loadLastSeenAt,
  saveLastSeenAt,
  storageKeyForUser,
} from '../lib/closedTrades';
import {
  type ActivityNotification,
  bettingCloseToNotification,
  botTradeToNotification,
  fetchBettingCloseNotifications,
  isActivityUnread,
  mergeActivityNotifications,
  toastMessageForNotification,
} from '../lib/activityNotifications';
import { syncBettingTradesToSupabase } from '../lib/betting/syncBettingTrades';
import { fetchHlOutcomeCatalog } from '../lib/hyperliquid/outcomes/meta';
import { fetchHlUserFills } from '../lib/hyperliquid/user';
import { isHlFillOpen } from '../lib/hyperliquid/format';
import { toNum } from '../lib/hyperliquid/parse';
import { useTermAuthToast } from '../components/terminal/TermAuthToast';
import { devError, isHlRateLimitError } from '../lib/devLog';

const NOTIFICATION_POLL_MS = 45_000;
const BETTING_SYNC_MS = 5 * 60_000;

type TradeNotificationsContextValue = {
  notifications: ActivityNotification[];
  /** @deprecated Use notifications */
  trades: ActivityNotification[];
  unreadCount: number;
  isLoading: boolean;
  refresh: () => void;
  markAllRead: () => void;
  markReadThrough: (closedAt: string) => void;
  isUnread: (notification: ActivityNotification) => boolean;
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
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const hlCloseIdsRef = useRef<Set<string>>(new Set());
  const hlCloseBootRef = useRef(false);
  const lastBettingSyncAtRef = useRef(0);
  const storageKey = storageKeyForUser(user?.id, isDemoUser);

  useEffect(() => {
    setLastSeenAt(loadLastSeenAt(storageKey));
  }, [storageKey]);

  useEffect(() => {
    hlCloseBootRef.current = false;
    hlCloseIdsRef.current = new Set();
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchUserWalletAddresses(address, isDemoUser);
      const merged = [...list];
      const connected = address?.toLowerCase();
      if (connected && !merged.includes(connected)) {
        merged.push(connected);
      }
      if (!cancelled) setWallets(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isDemoUser, user?.id]);

  const syncBettingForWallets = useCallback(async (force = false) => {
    if (!user?.id || isDemoUser || wallets.length === 0) return;
    if (document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (!force && now - lastBettingSyncAtRef.current < BETTING_SYNC_MS) return;

    try {
      const catalog = await fetchHlOutcomeCatalog();
      const unique = [...new Set(wallets.map((w) => w.toLowerCase()))].slice(0, 2);
      await Promise.all(
        unique.map((w) => syncBettingTradesToSupabase(user.id, w, catalog))
      );
      lastBettingSyncAtRef.current = now;
    } catch (err) {
      if (!isHlRateLimitError(err)) devError('[TradeNotifications] betting sync', err);
    }
  }, [user?.id, isDemoUser, wallets]);

  const pollHlFillCloses = useCallback(async () => {
    const wallet = address?.toLowerCase();
    if (!wallet) return;

    try {
      const fills = await fetchHlUserFills(wallet, 100);
      const closes = fills.filter((fill) => !isHlFillOpen(fill.dir));
      const nextIds = new Set(
        closes.map((fill) => String(fill.tid ?? `${fill.time}-${fill.coin}-${fill.closedPnl}`))
      );

      if (!hlCloseBootRef.current) {
        hlCloseBootRef.current = true;
        hlCloseIdsRef.current = nextIds;
        return;
      }

      const fresh = closes.filter((fill) => {
        const id = String(fill.tid ?? `${fill.time}-${fill.coin}-${fill.closedPnl}`);
        return !hlCloseIdsRef.current.has(id);
      });

      if (fresh.length > 0) {
        const latest = [...fresh].sort((a, b) => b.time - a.time)[0];
        const pnl = toNum(latest.closedPnl);
        const sign = pnl >= 0 ? '+' : '-';
        showToast(
          `Trade closed · ${latest.coin} ${sign}$${Math.abs(pnl).toFixed(2)}`,
          3600
        );
      }

      hlCloseIdsRef.current = nextIds;
    } catch (err) {
      if (!isHlRateLimitError(err)) devError('[TradeNotifications] HL fills', err);
    }
  }, [address, showToast]);

  const load = useCallback(
    async (silent = false) => {
      if (!isDemoUser && !user && wallets.length === 0 && !address) {
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        if (document.visibilityState === 'hidden') return;

        if (silent) {
          await pollHlFillCloses();
        }

        await syncBettingForWallets(!silent);

        const [botRowsRaw, bettingRowsRaw] = await Promise.all([
          fetchClosedTrades({ isDemoUser, wallets, limit: 100 }),
          isDemoUser ? Promise.resolve([]) : fetchBettingCloseNotifications(50),
        ]);

        const botRows = ensureArray(botRowsRaw);
        const bettingRows = ensureArray(bettingRowsRaw);

        const merged = mergeActivityNotifications(
          botRows.map(botTradeToNotification),
          bettingRows.map(bettingCloseToNotification),
          100
        );

        const prevIds = knownIdsRef.current;
        if (silent && prevIds.size > 0) {
          const fresh = merged.filter((r) => !prevIds.has(r.id));
          if (fresh.length > 0) {
            const latest = fresh.sort(
              (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
            )[0];
            showToast(toastMessageForNotification(latest), 3600);
          }
        }
        knownIdsRef.current = new Set(merged.map((r) => r.id));
        setNotifications(merged);
      } catch (e) {
        if (!isHlRateLimitError(e)) devError('[TradeNotifications]', e);
        if (!silent) setNotifications([]);
      } finally {
        setIsLoading(false);
      }
    },
    [isDemoUser, user, wallets, address, showToast, syncBettingForWallets, pollHlFillCloses]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void load(true);
    }, NOTIFICATION_POLL_MS);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (!user && !isDemoUser) return;

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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hl_betting_closes',
          ...(user?.id ? { filter: `user_id=eq.${user.id}` } : {}),
        },
        () => load(true)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, isDemoUser, load, address]);

  const markAllRead = useCallback(() => {
    const latest = notifications[0]?.closedAt ?? new Date().toISOString();
    saveLastSeenAt(storageKey, latest);
    setLastSeenAt(latest);
  }, [notifications, storageKey]);

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
    (notification: ActivityNotification) => isActivityUnread(notification, lastSeenAt),
    [lastSeenAt]
  );

  const unreadCount = useMemo(
    () => notifications.filter((t) => isActivityUnread(t, lastSeenAt)).length,
    [notifications, lastSeenAt]
  );

  const value = useMemo(
    () => ({
      notifications,
      trades: notifications,
      unreadCount,
      isLoading,
      refresh: () => load(true),
      markAllRead,
      markReadThrough,
      isUnread,
    }),
    [notifications, unreadCount, isLoading, load, markAllRead, markReadThrough, isUnread]
  );

  return (
    <TradeNotificationsContext.Provider value={value}>
      {children}
    </TradeNotificationsContext.Provider>
  );
};
