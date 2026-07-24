import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMonadierWallet } from '../hooks/useMonadierWallet';
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
  botTradeToNotification,
  isActivityUnread,
  mergeActivityNotifications,
  toastMessageForNotification,
} from '../lib/activityNotifications';
import {
  fetchUserTradeNotifications,
  isBellEligibleNotification,
  markAllUserTradeNotificationsRead,
  markUserTradeNotificationsReadThrough,
  userTradeNotificationToActivity,
  type UserTradeNotificationRow,
} from '../lib/userTradeNotifications';
import { syncBettingTradesToSupabase } from '../lib/betting/syncBettingTrades';
import { fetchHlOutcomeCatalog } from '../lib/hyperliquid/outcomes/meta';
import { useTermAuthToast } from '../components/terminal/TermAuthToast';
import { devError, isHlRateLimitError } from '../lib/devLog';

const NOTIFICATION_POLL_MS = 20_000;
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

function notifyFreshToasts(
  fresh: ActivityNotification[],
  showToast: (msg: string, ms?: number) => void
) {
  const notable = fresh.filter(
    (n) => n.kind !== 'community' && (n.profitLoss > 0 || n.eventType === 'open')
  );
  if (notable.length === 0) return;
  const sorted = [...notable].sort(
    (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime()
  );
  for (const n of sorted) {
    showToast(toastMessageForNotification(n), 4500);
  }
}

export const TradeNotificationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { address } = useMonadierWallet();
  const { user, isDemoUser } = useAuth();
  const communityNotifsEnabled = false; // Community parked — no mention toasts/bell noise
  const { showToast } = useTermAuthToast();
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);
  const lastBettingSyncAtRef = useRef(0);
  const storageKey = storageKeyForUser(user?.id, isDemoUser);

  useEffect(() => {
    setLastSeenAt(loadLastSeenAt(storageKey));
    bootstrappedRef.current = false;
    knownIdsRef.current = new Set();
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user && !isDemoUser) {
        if (!cancelled) setWallets([]);
        return;
      }
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

  const load = useCallback(
    async (silent = false) => {
      // Fatal: never load/show trade notifications without HyperGain login.
      // Wallet-only visitors must not see unread badges or toast noise.
      if (!user && !isDemoUser) {
        setNotifications([]);
        setIsLoading(false);
        bootstrappedRef.current = false;
        knownIdsRef.current = new Set();
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        if (document.visibilityState === 'hidden') return;

        await syncBettingForWallets(!silent);

        let merged: ActivityNotification[] = [];

        if (user && !isDemoUser) {
          // Single source of truth — same rows that drive close emails.
          merged = await fetchUserTradeNotifications(100);
          if (!communityNotifsEnabled) {
            merged = merged.filter((n) => n.kind !== 'community');
          }
        } else {
          // Demo only — never anonymous wallet.
          const closed = await fetchClosedTrades({
            isDemoUser: true,
            wallets: [DEMO_WALLET_ADDRESS],
            limit: 100,
          });
          const botRows = ensureArray(closed).map(botTradeToNotification);
          merged = mergeActivityNotifications(botRows, [], 100);
        }

        const prevIds = knownIdsRef.current;
        if (silent && bootstrappedRef.current && prevIds.size > 0) {
          const fresh = merged.filter((r) => !prevIds.has(r.id));
          notifyFreshToasts(fresh, showToast);
        }

        bootstrappedRef.current = true;
        knownIdsRef.current = new Set(merged.map((r) => r.id));
        setNotifications(merged);
      } catch (e) {
        if (!isHlRateLimitError(e)) devError('[TradeNotifications]', e);
        if (!silent) setNotifications([]);
      } finally {
        setIsLoading(false);
      }
    },
    [isDemoUser, user, showToast, syncBettingForWallets, communityNotifsEnabled]
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
    if (!user?.id || isDemoUser) return;

    const channel = supabase
      .channel(`user-trade-notif-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_trade_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as UserTradeNotificationRow | undefined;
          if (row?.id && isBellEligibleNotification(row)) {
            const fresh = userTradeNotificationToActivity(row);
            if (fresh.kind === 'community' && !communityNotifsEnabled) {
              return;
            }
            if (!knownIdsRef.current.has(fresh.id)) {
              knownIdsRef.current.add(fresh.id);
              if (
                fresh.kind === 'community' ||
                fresh.profitLoss > 0 ||
                fresh.eventType === 'open'
              ) {
                showToast(toastMessageForNotification(fresh), 4500);
              }
              setNotifications((prev) =>
                mergeActivityNotifications([fresh, ...prev], [], 100)
              );
            }
          }
          void load(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_trade_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void load(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hl_betting_closes',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void load(true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, isDemoUser, load, communityNotifsEnabled, showToast]);

  const markAllRead = useCallback(() => {
    const latest = notifications[0]?.closedAt ?? new Date().toISOString();
    saveLastSeenAt(storageKey, latest);
    setLastSeenAt(latest);
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: nowIso }))
    );
    if (user && !isDemoUser) {
      void markAllUserTradeNotificationsRead();
    }
  }, [notifications, storageKey, user, isDemoUser]);

  const markReadThrough = useCallback(
    (closedAt: string) => {
      const current = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
      const next = new Date(closedAt).getTime();
      if (next > current) {
        saveLastSeenAt(storageKey, closedAt);
        setLastSeenAt(closedAt);
      }
      const cutoff = new Date(closedAt).getTime();
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => {
          if (n.readAt) return n;
          if (new Date(n.closedAt).getTime() <= cutoff) {
            return { ...n, readAt: nowIso };
          }
          return n;
        })
      );
      if (user && !isDemoUser) {
        void markUserTradeNotificationsReadThrough(closedAt);
      }
    },
    [lastSeenAt, storageKey, user, isDemoUser]
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
