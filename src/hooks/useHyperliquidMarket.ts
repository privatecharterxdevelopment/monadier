import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchHlCandles,
  fetchHlMarketSnapshot,
  fetchHlOrderBook,
  fetchHlRecentTrades,
} from '../lib/hyperliquid/api';
import {
  fetchHlSpotCandles,
  fetchHlSpotMarketSnapshot,
  fetchHlSpotOrderBook,
  fetchHlSpotRecentTrades,
  type HlSpotMarketSnapshot,
} from '../lib/hyperliquid/spot';
import { toNum } from '../lib/hyperliquid/parse';
import { getHlWsClient } from '../lib/hyperliquid/ws';
import type {
  HlCandleBar,
  HlInterval,
  HlL2Book,
  HlMarketSnapshot,
  HlRecentTrade,
} from '../lib/hyperliquid/types';

export type HlMarketKind = 'perp' | 'spot';

type State = {
  candles: HlCandleBar[];
  book: HlL2Book | null;
  snapshot: HlMarketSnapshot | HlSpotMarketSnapshot | null;
  recentTrades: HlRecentTrade[];
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
};

const SNAPSHOT_POLL_MS = 10_000;

function mergeCandle(candles: HlCandleBar[], bar: HlCandleBar): HlCandleBar[] {
  if (candles.length === 0) return [bar];
  const last = candles[candles.length - 1];
  if (last.time === bar.time) {
    return [...candles.slice(0, -1), bar];
  }
  if (bar.time > last.time) {
    return [...candles, bar].slice(-500);
  }
  return candles;
}

function parseWsCandle(raw: Record<string, unknown>): HlCandleBar | null {
  const t = toNum(raw.t);
  if (t <= 0) return null;
  return {
    time: Math.floor(t / 1000),
    open: toNum(raw.o),
    high: toNum(raw.h),
    low: toNum(raw.l),
    close: toNum(raw.c),
    volume: toNum(raw.v),
  };
}

function parseWsTrade(raw: Record<string, unknown>, coin: string): HlRecentTrade {
  return {
    coin: String(raw.coin ?? coin),
    side: String(raw.side ?? ''),
    px: String(raw.px ?? '0'),
    sz: String(raw.sz ?? '0'),
    time: toNum(raw.time),
  };
}

export function useHyperliquidMarket(
  coin: string,
  interval: HlInterval,
  kind: HlMarketKind = 'perp'
) {
  const [state, setState] = useState<State>({
    candles: [],
    book: null,
    snapshot: null,
    recentTrades: [],
    loading: true,
    error: null,
    wsConnected: false,
  });

  const refreshSnapshot = useCallback(async () => {
    try {
      const snapshot =
        kind === 'spot'
          ? await fetchHlSpotMarketSnapshot(coin)
          : await fetchHlMarketSnapshot(coin);
      setState((prev) => ({ ...prev, snapshot }));
    } catch {
      /* keep last snapshot */
    }
  }, [coin, kind]);

  const refresh = useCallback(async () => {
    try {
      const [candles, book, snapshot, recentTrades] = await Promise.all([
        kind === 'spot' ? fetchHlSpotCandles(coin, interval) : fetchHlCandles(coin, interval),
        kind === 'spot' ? fetchHlSpotOrderBook(coin) : fetchHlOrderBook(coin),
        kind === 'spot' ? fetchHlSpotMarketSnapshot(coin) : fetchHlMarketSnapshot(coin),
        kind === 'spot' ? fetchHlSpotRecentTrades(coin) : fetchHlRecentTrades(coin),
      ]);
      setState((prev) => ({
        ...prev,
        candles,
        book,
        snapshot,
        recentTrades,
        loading: false,
        error: null,
      }));
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Market data unavailable',
      }));
    }
  }, [coin, interval, kind]);

  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => void refreshSnapshot(), SNAPSHOT_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshSnapshot]);

  const bookKeyRef = useRef('');
  const pendingBookRef = useRef<HlL2Book | null>(null);
  const bookTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTradesRef = useRef<HlRecentTrade[]>([]);
  const tradesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBook = useCallback(() => {
    bookTimerRef.current = null;
    const next = pendingBookRef.current;
    if (!next) return;
    const key = bookLevelsKey(next);
    if (key === bookKeyRef.current) return;
    bookKeyRef.current = key;
    setState((prev) => ({ ...prev, book: next, wsConnected: true }));
  }, []);

  const scheduleBook = useCallback(
    (book: HlL2Book) => {
      const key = bookLevelsKey(book);
      if (key === bookKeyRef.current && !bookTimerRef.current) return;
      pendingBookRef.current = book;
      if (bookTimerRef.current) return;
      bookTimerRef.current = setTimeout(flushBook, BOOK_THROTTLE_MS);
    },
    [flushBook]
  );

  const flushTrades = useCallback(() => {
    tradesTimerRef.current = null;
    const batch = pendingTradesRef.current;
    if (batch.length === 0) return;
    pendingTradesRef.current = [];
    setState((prev) => ({
      ...prev,
      recentTrades: [...batch.reverse(), ...prev.recentTrades].slice(0, 80),
      wsConnected: true,
    }));
  }, []);

  const scheduleTrades = useCallback(
    (trades: HlRecentTrade[]) => {
      pendingTradesRef.current.push(...trades);
      if (tradesTimerRef.current) return;
      tradesTimerRef.current = setTimeout(flushTrades, TRADES_THROTTLE_MS);
    },
    [flushTrades]
  );

  useEffect(() => {
    const client = getHlWsClient();
    const unsubs = [
      client.subscribe({ type: 'l2Book', coin }),
      client.subscribe({ type: 'trades', coin }),
      client.subscribe({ type: 'candle', coin, interval }),
    ];

    const off = client.addListener((channel, data) => {
      if (channel === 'l2Book') {
        scheduleBook(data as HlL2Book);
        return;
      }
      if (channel === 'trades') {
        const rows = Array.isArray(data) ? data : [data];
        const parsed = rows
          .map((r) => parseWsTrade(r as Record<string, unknown>, coin))
          .filter((t) => t.time > 0);
        if (parsed.length === 0) return;
        scheduleTrades(parsed);
        return;
      }
      if (channel === 'candle') {
        const rows = Array.isArray(data) ? data : [data];
        for (const row of rows) {
          const bar = parseWsCandle(row as Record<string, unknown>);
          if (!bar) continue;
          setState((prev) => ({
            ...prev,
            candles: mergeCandle(prev.candles, bar),
            wsConnected: true,
          }));
        }
      }
    });

    return () => {
      for (const u of unsubs) u();
      off();
      if (bookTimerRef.current) clearTimeout(bookTimerRef.current);
      if (tradesTimerRef.current) clearTimeout(tradesTimerRef.current);
      bookTimerRef.current = null;
      tradesTimerRef.current = null;
      pendingBookRef.current = null;
      pendingTradesRef.current = [];
      bookKeyRef.current = '';
    };
  }, [coin, interval, scheduleBook, scheduleTrades]);

  return { ...state, refresh };
}
