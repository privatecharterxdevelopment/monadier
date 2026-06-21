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
import { chartLookbackMs } from '../lib/hyperliquid/chartZoom';
import { getHlWsClient } from '../lib/hyperliquid/ws';
import type {
  HlCandleBar,
  HlInterval,
  HlL2Book,
  HlMarketSnapshot,
  HlRecentTrade,
} from '../lib/hyperliquid/types';

export type HlMarketKind = 'perp' | 'spot';

export type UseHyperliquidMarketOptions = {
  /** When false, skips REST polling and WS subscriptions (saves HL rate limit). */
  enabled?: boolean;
};

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
const INTERVAL_DEBOUNCE_MS = 280;
const BOOK_THROTTLE_MS = 16;
const TRADES_THROTTLE_MS = 48;
const CANDLE_THROTTLE_MS = 50;
const MIDS_THROTTLE_MS = 48;
const MAX_TAPE_TRADES = 50;

function normCoin(coin: string): string {
  return coin.trim().toUpperCase();
}

function coinMatches(a: string, b: string): boolean {
  return normCoin(a) === normCoin(b);
}

function bookLevelsKey(book: HlL2Book): string {
  const fmt = (levels: { px: string; sz: string }[] | undefined, n: number) =>
    levels?.slice(0, n).map((l) => `${l.px}:${l.sz}`).join('|') ?? '';
  const asks = fmt(book.levels?.[1], 8);
  const bids = fmt(book.levels?.[0], 8);
  return `${book.coin ?? ''}|${asks}|${bids}`;
}

function sortTapeTrades(trades: HlRecentTrade[]): HlRecentTrade[] {
  return [...trades]
    .filter((t) => t.time > 0)
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_TAPE_TRADES);
}

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

function parseWsTrade(
  raw: Record<string, unknown>,
  coin: string
): HlRecentTrade | null {
  const tradeCoin = String(raw.coin ?? coin);
  if (!coinMatches(tradeCoin, coin)) return null;
  const time = toNum(raw.time);
  if (time <= 0) return null;
  return {
    coin: tradeCoin,
    side: String(raw.side ?? ''),
    px: String(raw.px ?? '0'),
    sz: String(raw.sz ?? '0'),
    time,
  };
}

export function useHyperliquidMarket(
  coin: string,
  interval: HlInterval,
  kind: HlMarketKind = 'perp',
  options: UseHyperliquidMarketOptions = {}
) {
  const enabled = options.enabled !== false && coin.trim().length > 0;
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
    if (!enabled) return;
    try {
      const [snapshot, recentTrades] = await Promise.all([
        kind === 'spot'
          ? fetchHlSpotMarketSnapshot(coin)
          : fetchHlMarketSnapshot(coin),
        kind === 'spot' ? fetchHlSpotRecentTrades(coin) : fetchHlRecentTrades(coin),
      ]);
      setState((prev) => ({
        ...prev,
        snapshot,
        recentTrades: sortTapeTrades(
          recentTrades.filter((t) => coinMatches(t.coin, coin))
        ),
      }));
    } catch {
      /* keep last snapshot */
    }
  }, [coin, kind, enabled]);

  const refreshCandles = useCallback(async () => {
    if (!enabled) return;
    try {
      const candles =
        kind === 'spot'
          ? await fetchHlSpotCandles(coin, interval)
          : await fetchHlCandles(coin, interval, chartLookbackMs(interval));
      setState((prev) => ({
        ...prev,
        candles,
        loading: false,
        error: null,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chart data unavailable';
      const isRateLimit = message.includes('429');
      setState((prev) => ({
        ...prev,
        loading: false,
        // Keep last candles visible during brief HL rate limits.
        error: isRateLimit && prev.candles.length > 0 ? null : message,
      }));
    }
  }, [coin, interval, kind, enabled]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestedCoin = normCoin(coin);
    try {
      const [candles, book, snapshot, recentTrades] = await Promise.all([
        kind === 'spot'
          ? fetchHlSpotCandles(coin, interval)
          : fetchHlCandles(coin, interval, chartLookbackMs(interval)),
        kind === 'spot' ? fetchHlSpotOrderBook(coin) : fetchHlOrderBook(coin),
        kind === 'spot' ? fetchHlSpotMarketSnapshot(coin) : fetchHlMarketSnapshot(coin),
        kind === 'spot' ? fetchHlSpotRecentTrades(coin) : fetchHlRecentTrades(coin),
      ]);
      setState((prev) => {
        if (normCoin(coin) !== requestedCoin) return prev;
        return {
          candles,
          book,
          snapshot,
          recentTrades: sortTapeTrades(
            recentTrades.filter((t) => coinMatches(t.coin, requestedCoin))
          ),
          loading: false,
          error: null,
          wsConnected: false,
        };
      });
    } catch (err: unknown) {
      setState((prev) => {
        if (normCoin(coin) !== requestedCoin) return prev;
        return {
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Market data unavailable',
        };
      });
    }
  }, [coin, interval, kind, enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({
        candles: [],
        book: null,
        snapshot: null,
        recentTrades: [],
        loading: false,
        error: null,
        wsConnected: false,
      });
      return;
    }
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      wsConnected: false,
    }));
    void refresh();
    // Interval changes are handled separately (candles only).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- coin/kind/enabled only
  }, [coin, kind, enabled]);

  const prevIntervalRef = useRef<HlInterval | null>(null);

  useEffect(() => {
    prevIntervalRef.current = null;
  }, [coin, kind, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (prevIntervalRef.current === null) {
      prevIntervalRef.current = interval;
      return undefined;
    }
    if (prevIntervalRef.current === interval) return undefined;
    prevIntervalRef.current = interval;
    const id = window.setTimeout(() => void refreshCandles(), INTERVAL_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [interval, refreshCandles, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => void refreshSnapshot(), SNAPSHOT_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshSnapshot, enabled]);

  const bookKeyRef = useRef('');
  const pendingBookRef = useRef<HlL2Book | null>(null);
  const bookTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTradesRef = useRef<HlRecentTrade[]>([]);
  const tradesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCandleRef = useRef<HlCandleBar | null>(null);
  const candleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const midsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMidRef = useRef<number | null>(null);

  const flushCandle = useCallback(() => {
    candleTimerRef.current = null;
    const bar = pendingCandleRef.current;
    if (!bar) return;
    pendingCandleRef.current = null;
    setState((prev) => ({
      ...prev,
      candles: mergeCandle(prev.candles, bar),
      wsConnected: true,
    }));
  }, []);

  const scheduleCandle = useCallback(
    (bar: HlCandleBar) => {
      pendingCandleRef.current = bar;
      if (candleTimerRef.current) return;
      candleTimerRef.current = setTimeout(flushCandle, CANDLE_THROTTLE_MS);
    },
    [flushCandle]
  );

  const flushMid = useCallback(() => {
    midsTimerRef.current = null;
    const px = pendingMidRef.current;
    if (px == null || px <= 0) return;
    pendingMidRef.current = null;
    setState((prev) => ({
      ...prev,
      snapshot: prev.snapshot
        ? { ...prev.snapshot, markPx: String(px) }
        : prev.snapshot,
      wsConnected: true,
    }));
  }, []);

  const scheduleMid = useCallback(
    (px: number) => {
      pendingMidRef.current = px;
      if (midsTimerRef.current) return;
      midsTimerRef.current = setTimeout(flushMid, MIDS_THROTTLE_MS);
    },
    [flushMid]
  );

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
      recentTrades: sortTapeTrades([...batch.reverse(), ...prev.recentTrades]),
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
    if (!enabled) return undefined;
    const client = getHlWsClient();
    const unsubs = [
      client.subscribe({ type: 'l2Book', coin }),
      client.subscribe({ type: 'trades', coin }),
      client.subscribe({ type: 'candle', coin, interval }),
      client.subscribe({ type: 'allMids' }),
    ];

    const off = client.addListener((channel, data) => {
      if (channel === 'allMids') {
        const mids = data as Record<string, string>;
        const px = toNum(mids[coin] ?? mids[`${coin}-PERP`]);
        if (px > 0) scheduleMid(px);
        return;
      }
      if (channel === 'l2Book') {
        const book = data as HlL2Book;
        if (book.coin && !coinMatches(book.coin, coin)) return;
        scheduleBook(book);
        return;
      }
      if (channel === 'trades') {
        const rows = Array.isArray(data) ? data : [data];
        const parsed = rows
          .map((r) => parseWsTrade(r as Record<string, unknown>, coin))
          .filter((t): t is HlRecentTrade => t != null);
        if (parsed.length === 0) return;
        scheduleTrades(parsed);
        return;
      }
      if (channel === 'candle') {
        const rows = Array.isArray(data) ? data : [data];
        for (const row of rows) {
          const raw = row as Record<string, unknown>;
          const candleCoin = String(raw.s ?? raw.coin ?? coin);
          if (!coinMatches(candleCoin, coin)) continue;
          const bar = parseWsCandle(raw);
          if (!bar) continue;
          scheduleCandle(bar);
        }
      }
    });

    return () => {
      for (const u of unsubs) u();
      off();
      if (bookTimerRef.current) clearTimeout(bookTimerRef.current);
      if (tradesTimerRef.current) clearTimeout(tradesTimerRef.current);
      if (candleTimerRef.current) clearTimeout(candleTimerRef.current);
      if (midsTimerRef.current) clearTimeout(midsTimerRef.current);
      bookTimerRef.current = null;
      tradesTimerRef.current = null;
      candleTimerRef.current = null;
      midsTimerRef.current = null;
      pendingBookRef.current = null;
      pendingTradesRef.current = [];
      pendingCandleRef.current = null;
      bookKeyRef.current = '';
    };
  }, [coin, interval, scheduleBook, scheduleTrades, scheduleCandle, scheduleMid, enabled]);

  return { ...state, refresh };
}
