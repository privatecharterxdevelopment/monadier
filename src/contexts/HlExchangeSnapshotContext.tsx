import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHyperliquidAccount } from '../hooks/useHyperliquidAccount';
import { useHyperliquidMarkPrices } from '../hooks/useHyperliquidMarkPrices';
import {
  buildHlExchangeSnapshot,
  type HlExchangeSnapshot,
} from '../lib/hlExchangeSnapshot';
import { toNum } from '../lib/hyperliquid/parse';
import { isMeaningfulHlPosition } from '../lib/hyperliquid/format';

const MARK_REFRESH_MS = 1_200;

type Ctx = {
  snapshot: HlExchangeSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const HlExchangeSnapshotContext = createContext<Ctx>({
  snapshot: null,
  loading: false,
  refresh: async () => {},
});

export function HlExchangeSnapshotProvider({
  wallet,
  enabled = true,
  children,
}: {
  wallet: string | undefined;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const active = enabled && Boolean(wallet);
  const { account, openOrders, loading, refresh: refreshAccount } = useHyperliquidAccount(
    active ? wallet : undefined
  );
  const positionCoins = useMemo(() => {
    const list = account?.positions ?? [];
    return [...new Set(list.filter((p) => isMeaningfulHlPosition(p.szi, p.entryPx)).map((p) => p.coin))];
  }, [account?.positions]);

  const { prices: marks, meta: markMeta, refresh: refreshMarks } = useHyperliquidMarkPrices(
    positionCoins,
    MARK_REFRESH_MS
  );

  const positionsAtRef = useRef(0);
  const [positionsAsOfMs, setPositionsAsOfMs] = useState(0);

  useEffect(() => {
    if (!account) return;
    const at = Date.now();
    positionsAtRef.current = at;
    setPositionsAsOfMs(at);
  }, [account]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const snapshot = useMemo(() => {
    if (!wallet || !account) return null;
    void tick;
    const positions = (account.positions ?? []).filter((p) => Math.abs(toNum(p.szi)) > 1e-12);
    const marksAsOfMs = Math.max(markMeta.lastWsAt, markMeta.lastRestAt, 0);
    return buildHlExchangeSnapshot({
      wallet,
      positions,
      marks,
      openOrders,
      positionsAsOfMs: positionsAsOfMs || positionsAtRef.current || Date.now(),
      marksAsOfMs: marksAsOfMs || Date.now(),
      marksWsLive: markMeta.wsLive,
    });
  }, [
    wallet,
    account,
    marks,
    openOrders,
    positionsAsOfMs,
    markMeta.lastWsAt,
    markMeta.lastRestAt,
    markMeta.wsLive,
    tick,
  ]);

  const refresh = useCallback(async () => {
    await refreshAccount({ forceHeavy: false });
    await refreshMarks();
  }, [refreshAccount, refreshMarks]);

  const value = useMemo(
    () => ({ snapshot, loading: active && loading && !snapshot, refresh }),
    [snapshot, loading, active, refresh]
  );

  return (
    <HlExchangeSnapshotContext.Provider value={value}>{children}</HlExchangeSnapshotContext.Provider>
  );
}

export function useHlExchangeSnapshot(): Ctx {
  return useContext(HlExchangeSnapshotContext);
}
