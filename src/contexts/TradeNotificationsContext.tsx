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
  pickFreshNotificationsForToast,
  toastMessageForNotification,
} from '../lib/activityNotifications';
import {
  fetchUnreadTradeNotificationCount,
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
import { getHlWsClient } from '../lib/hyperliquid/ws';
import { fetchHlUserFills, type HlUserFill } from '../lib/hyperliquid/user';
import { fillPositionDirection, fmtClosedPnl, isHlFillClose } from '../lib/hyperliquid/format';
import { subscribeTradeNotificationRefresh } from '../lib/tradeNotificationEvents';

const NOTIFICATION_POLL_MS = 25_000;
const SILENT_RELOAD_DEBOUNCE_MS = 600;
const HL_CLOSE_FILL_KEY_CAP = 800;
const BETTING_SYNC_MS = 5 * 60_000;
const UNREAD_BADGE_CAP = 99;

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

function fillCloseKey(f: HlUserFill): string {
  return `${f.coin}|${f.time}|${f.tid ?? 0}`;
}

function optimisticCloseNotification(f: HlUserFill): ActivityNotification {
  const dir = fillPositionDirection(f);
  const ms = f.time > 1e12 ? f.time : f.time * 1000;
  return {
    id: `hl-fill-${fillCloseKey(f)}`,
    kind: 'bot',
    headline: `${dir} ${f.coin}`,
    profitLoss: Number(f.closedPnl) || 0,
    closedAt: new Date(ms).toISOString(),
    eventType: 'close',
  };
}

function rememberHlCloseKey(set: Set<string>, key: string): boolean {
  if (!key || set.has(key)) return false;
  set.add(key);
  if (set.size > HL_CLOSE_FILL_KEY_CAP) {
    const first = set.values().next().value;
    if (first) set.delete(first);
  }
  return true;
}

function notifyFreshToasts(
  fresh: ActivityNotification[],
  showToast: (msg: string, ms?: number) => void
) {
  const toShow = pickFreshNotificationsForToast(fresh);
  if (toShow.length === 0) return;
  for (const n of [...toShow].reverse()) {
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
  const [unreadDbCount, setUnreadDbCount] = useState(0);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [wallets, setWallets] = useState<string[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const knownHlCloseFillKeysRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);
  const lastBettingSyncAtRef = useRef(0);
  const loadGenRef = useRef(0);
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToastRef = useRef(showToast);
  const walletsRef = useRef(wallets);
  const storageKey = storageKeyForUser(user?.id, isDemoUser);

  showToastRef.current = showToast;
  walletsRef.current = wallets;

  useEffect(() => {
    setLastSeenAt(loadLastSeenAt(storageKey));
    bootstrappedRef.current = false;
    knownIdsRef.current = new Set();
    knownHlCloseFillKeysRef.current = new Set();
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

  const syncBettingForWallets = useCallback(
    async (force = false) => {
      const w = walletsRef.current;
      if (!user?.id || isDemoUser || w.length === 0) return;
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (!force && now - lastBettingSyncAtRef.current < BETTING_SYNC_MS) return;

      try {
        const catalog = await fetchHlOutcomeCatalog();
        const unique = [...new Set(w.map((x) => x.toLowerCase()))].slice(0, 2);
        await Promise.all(
          unique.map((wallet) => syncBettingTradesToSupabase(user.id, wallet, catalog))
        );
        lastBettingSyncAtRef.current = now;
      } catch (err) {
        if (!isHlRateLimitError(err)) devError('[TradeNotifications] betting sync', err);
      }
    },
    [user?.id, isDemoUser]
  );

  const runLoad = useCallback(
    async (silent = false) => {
      const gen = ++loadGenRef.current;

      if (!user && !isDemoUser) {
        setNotifications([]);
        setUnreadDbCount(0);
        setIsLoading(false);
        bootstrappedRef.current = false;
        knownIdsRef.current = new Set();
        return;
      }

      const showSpinner = !silent && !bootstrappedRef.current;
      if (showSpinner) setIsLoading(true);

      try {
        if (document.visibilityState === 'hidden' && silent) return;

        await syncBettingForWallets(!silent);
        if (gen !== loadGenRef.current) return;

        let merged: ActivityNotification[] = [];
        let unreadCountFromDb = 0;

        if (user && !isDemoUser) {
          const [rows, unreadTotal] = await Promise.all([
            fetchUserTradeNotifications(100),
            fetchUnreadTradeNotificationCount(),
          ]);
          if (gen !== loadGenRef.current) return;
          merged = rows;
          unreadCountFromDb = unreadTotal;
          if (!communityNotifsEnabled) {
            merged = merged.filter((n) => n.kind !== 'community');
          }
        } else {
          const closed = await fetchClosedTrades({
            isDemoUser: true,
            wallets: [DEMO_WALLET_ADDRESS],
            limit: 100,
          });
          if (gen !== loadGenRef.current) return;
          const botRows = ensureArray(closed).map(botTradeToNotification);
          merged = mergeActivityNotifications(botRows, [], 100);
        }

        const prevIds = knownIdsRef.current;
        if (silent && bootstrappedRef.current && prevIds.size > 0) {
          const fresh = merged.filter((r) => !prevIds.has(r.id));
          notifyFreshToasts(fresh, (msg, ms) => showToastRef.current(msg, ms));
        }

        bootstrappedRef.current = true;
        knownIdsRef.current = new Set(merged.map((r) => r.id));
        setUnreadDbCount(unreadCountFromDb);
        setNotifications((prev) => {
          const optimistic = prev.filter((n) => n.id.startsWith('hl-fill-'));
          if (optimistic.length === 0) return merged;
          for (const o of optimistic) knownIdsRef.current.add(o.id);
          return mergeActivityNotifications(merged, optimistic, 100);
        });
      } catch (e) {
        if (!isHlRateLimitError(e)) devError('[TradeNotifications]', e);
        if (!silent && !bootstrappedRef.current) setNotifications([]);
      } finally {
        if (showSpinner) setIsLoading(false);
      }
    },
    [isDemoUser, user, syncBettingForWallets, communityNotifsEnabled]
  );

  const scheduleSilentReload = useCallback(() => {
    if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
    reloadDebounceRef.current = setTimeout(() => {
      reloadDebounceRef.current = null;
      void runLoad(true);
    }, SILENT_RELOAD_DEBOUNCE_MS);
  }, [runLoad]);

  useEffect(() => {
    void runLoad(false);
  }, [user?.id, isDemoUser, storageKey, runLoad]);

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    scheduleSilentReload();
  }, [wallets, scheduleSilentReload]);

  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      scheduleSilentReload();
    }, NOTIFICATION_POLL_MS);
    return () => clearInterval(poll);
  }, [scheduleSilentReload]);

  useEffect(() => {
    return subscribeTradeNotificationRefresh(() => {
      scheduleSilentReload();
    });
  }, [scheduleSilentReload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleSilentReload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [scheduleSilentReload]);

  useEffect(
    () => () => {
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
    },
    []
  );

  const processHlCloseFills = useCallback(
    (fills: HlUserFill[], opts?: { toast?: boolean; optimistic?: boolean }) => {
      const wantToast = opts?.toast !== false;
      const wantOptimistic = opts?.optimistic !== false;
      let anyNew = false;
      for (const f of fills) {
        if (!isHlFillClose(f.dir, f.closedPnl)) continue;
        const key = fillCloseKey(f);
        if (!rememberHlCloseKey(knownHlCloseFillKeysRef.current, key)) continue;
        anyNew = true;
        const dir = fillPositionDirection(f);
        const optimistic = optimisticCloseNotification(f);
        if (wantToast) {
          showToastRef.current(toastMessageForNotification(optimistic), 6_000);
        }
        if (wantOptimistic) {
          knownIdsRef.current.add(optimistic.id);
          setNotifications((prev) => mergeActivityNotifications([optimistic, ...prev], [], 100));
        }
      }
      if (anyNew) scheduleSilentReload();
    },
    [scheduleSilentReload]
  );

  useEffect(() => {
    if (!user?.id || isDemoUser || wallets.length === 0) return;
    const hlWallets = [
      ...new Set(wallets.map((w) => w.toLowerCase()).filter(Boolean)),
    ].slice(0, 5);
    if (hlWallets.length === 0) return;

    let cancelled = false;
    void Promise.all(hlWallets.map((w) => fetchHlUserFills(w, 60))).then((groups) => {
      if (cancelled) return;
      for (const fills of groups) {
        for (const f of fills) {
          if (!isHlFillClose(f.dir, f.closedPnl)) continue;
          rememberHlCloseKey(knownHlCloseFillKeysRef.current, fillCloseKey(f));
        }
      }
    });

    const client = getHlWsClient();
    const unsubs = hlWallets.map((w) => client.subscribe({ type: 'userFills', user: w }));
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const off = client.addListener((channel) => {
      if (channel !== 'userFills') return;
      if (document.visibilityState === 'hidden') return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void (async () => {
          try {
            const groups = await Promise.all(hlWallets.map((w) => fetchHlUserFills(w, 25)));
            if (cancelled) return;
            processHlCloseFills(groups.flat(), { toast: true, optimistic: true });
          } catch (e) {
            if (!isHlRateLimitError(e)) devError('[TradeNotifications] HL fill close', e);
          }
        })();
      }, 80);
    });

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
      off();
      if (debounce) clearTimeout(debounce);
    };
  }, [user?.id, isDemoUser, wallets, processHlCloseFills]);

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
              showToastRef.current(toastMessageForNotification(fresh), 4500);
              setNotifications((prev) =>
                mergeActivityNotifications([fresh, ...prev], [], 100)
              );
              setUnreadDbCount((c) => c + 1);
            }
          }
          scheduleSilentReload();
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
          scheduleSilentReload();
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
          scheduleSilentReload();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, isDemoUser, scheduleSilentReload, communityNotifsEnabled]);

  const markAllRead = useCallback(() => {
    const latest = notifications[0]?.closedAt ?? new Date().toISOString();
    saveLastSeenAt(storageKey, latest);
    setLastSeenAt(latest);
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: nowIso }))
    );
    setUnreadDbCount(0);
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

  const unreadCount = useMemo(() => {
    if (user && !isDemoUser) {
      return Math.min(unreadDbCount, UNREAD_BADGE_CAP);
    }
    return notifications.filter((t) => isActivityUnread(t, lastSeenAt)).length;
  }, [notifications, lastSeenAt, unreadDbCount, user, isDemoUser]);

  const value = useMemo(
    () => ({
      notifications,
      trades: notifications,
      unreadCount,
      isLoading,
      refresh: () => scheduleSilentReload(),
      markAllRead,
      markReadThrough,
      isUnread,
    }),
    [notifications, unreadCount, isLoading, scheduleSilentReload, markAllRead, markReadThrough, isUnread]
  );

  return (
    <TradeNotificationsContext.Provider value={value}>
      {children}
    </TradeNotificationsContext.Provider>
  );
};
