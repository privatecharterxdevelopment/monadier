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
import { chartDebugLog, chartDebugWarn } from '../lib/hyperliquid/chartDebug';
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
  fetchAttempts: number;
};

const SNAPSHOT_POLL_MS = 10_000;
const BOOK_FALLBACK_POLL_MS = 2_000;
const EMPTY_CANDLE_RETRY_MS = 900;
/** Keep retrying — never “give up” into WS-only (1 bar = blank chart with a single spike). */
const MAX_EMPTY_CANDLE_RETRIES = 24;
/** Below this, REST history is not trusted as “ready” (WS alone must not paint the chart). */
const MIN_HISTORY_BARS = 24;
const BOOK_THROTTLE_MS = 16;
const TRADES_THROTTLE_MS = 48;
const CANDLE_THROTTLE_MS = 50;
const MIDS_THROTTLE_MS = 48;
const MAX_TAPE_TRADES = 50;
/** Must match ProTradeOrderBook DEPTH — dedup ignored deeper levels otherwise. */
const BOOK_LEVELS_KEY_DEPTH = 14;

function normCoin(coin: string): string {
  return coin.trim().toUpperCase();
}

function coinMatches(a: string, b: string): boolean {
  return normCoin(a) === normCoin(b);
}

function bookLevelsKey(book: HlL2Book): string {
  const fmt = (levels: { px: string; sz: string }[] | undefined, n: number) =>
    levels?.slice(0, n).map((l) => `${l.px}:${l.sz}`).join('|') ?? '';
  const asks = fmt(book.levels?.[1], BOOK_LEVELS_KEY_DEPTH);
  const bids = fmt(book.levels?.[0], BOOK_LEVELS_KEY_DEPTH);
  return `${book.coin ?? ''}|${book.time}|${asks}|${bids}`;
}

function sortTapeTrades(trades: HlRecentTrade[]): HlRecentTrade[] {
  return [...trades]
    .filter((t) => t.time > 0)
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_TAPE_TRADES);
}

/** Soft memory cap — must hold Jan 1 2026 → now even on 1m (~300k bars). */
const MAX_LIVE_CANDLES = 400_000;

function mergeCandle(candles: HlCandleBar[], bar: HlCandleBar): HlCandleBar[] {
  if (candles.length === 0) return [bar];
  const last = candles[candles.length - 1];
  if (last.time === bar.time) {
    return [...candles.slice(0, -1), bar];
  }
  if (bar.time > last.time) {
    const next = [...candles, bar];
    return next.length > MAX_LIVE_CANDLES ? next.slice(-MAX_LIVE_CANDLES) : next;
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
    fetchAttempts: 0,
  });

  const bookKeyRef = useRef('');
  const emptyRetryRef = useRef(0);
  const emptyRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Block WS candle merges until REST history for coin+interval is applied. */
  const historyReadyRef = useRef(false);
  const marketKeyRef = useRef('');
  const coinKeyRef = useRef('');
  const candleCacheRef = useRef<Map<string, HlCandleBar[]>>(new Map());
  const CANDLE_CACHE_MAX = 18;

  const marketKey = `${normCoin(coin)}:${interval}:${kind}`;
  const coinKey = `${normCoin(coin)}:${kind}`;

  const clearEmptyRetry = useCallback(() => {
    if (emptyRetryTimerRef.current) {
      clearTimeout(emptyRetryTimerRef.current);
      emptyRetryTimerRef.current = null;
    }
    emptyRetryRef.current = 0;
  }, []);

  const scheduleEmptyRetry = useCallback(
    (reason: string, run: () => Promise<void>) => {
      if (emptyRetryRef.current >= MAX_EMPTY_CANDLE_RETRIES) {
        // Stay WS-blocked — a single live bar is the “empty chart / one red spike” bug.
        chartDebugWarn('market', 'empty-candles-gave-up-still-blocked', {
          coin,
          interval,
          reason,
        });
        historyReadyRef.current = false;
        return;
      }
      emptyRetryRef.current += 1;
      const attempt = emptyRetryRef.current;
      chartDebugWarn('market', 'empty-candles-retry', { coin, interval, reason, attempt });
      emptyRetryTimerRef.current = setTimeout(() => {
        emptyRetryTimerRef.current = null;
        void run();
      }, Math.min(12_000, EMPTY_CANDLE_RETRY_MS * attempt));
    },
    [coin, interval]
  );

  const refreshSnapshot = useCallback(async () => {
    if (!enabled) return;
    const requestedCoinKey = coinKey;
    try {
      const [snapshot, recentTrades] = await Promise.all([
        kind === 'spot'
          ? fetchHlSpotMarketSnapshot(coin)
          : fetchHlMarketSnapshot(coin),
        kind === 'spot' ? fetchHlSpotRecentTrades(coin) : fetchHlRecentTrades(coin),
      ]);
      if (coinKeyRef.current !== requestedCoinKey) return;
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
  }, [coin, coinKey, kind, enabled]);

  const refreshBook = useCallback(async () => {
    if (!enabled) return;
    const requestedCoinKey = coinKey;
    try {
      const book =
        kind === 'spot' ? await fetchHlSpotOrderBook(coin) : await fetchHlOrderBook(coin);
      if (coinKeyRef.current !== requestedCoinKey) return;
      const key = bookLevelsKey(book);
      setState((prev) => {
        if (coinKeyRef.current !== requestedCoinKey) return prev;
        if (key === bookKeyRef.current) {
          return { ...prev, wsConnected: getHlWsClient().isLive() };
        }
        bookKeyRef.current = key;
        return {
          ...prev,
          book,
          wsConnected: getHlWsClient().isLive(),
        };
      });
    } catch {
      /* keep last book */
    }
  }, [coin, coinKey, kind, enabled]);

  const refreshCandles = useCallback(async () => {
    if (!enabled) return;
    const requestedCoin = normCoin(coin);
    const requestedMarketKey = marketKey;
    const attempt = emptyRetryRef.current + 1;
    chartDebugLog('market', 'fetch-candles-start', { coin: requestedCoin, interval, attempt });
    try {
      const candles =
        kind === 'spot'
          ? await fetchHlSpotCandles(coin, interval, chartLookbackMs(interval))
          : await fetchHlCandles(coin, interval, chartLookbackMs(interval));
      if (marketKeyRef.current !== requestedMarketKey) return;
      let shouldRetry = false;
      setState((prev) => {
        if (marketKeyRef.current !== requestedMarketKey) return prev;
        if (candles.length < MIN_HISTORY_BARS) {
          shouldRetry = true;
          historyReadyRef.current = false;
          return {
            ...prev,
            // Keep prior history for this market if we already had it — never replace with a stub.
            loading: false,
            error:
              prev.candles.length >= MIN_HISTORY_BARS
                ? null
                : 'No candle data from Hyperliquid',
            fetchAttempts: attempt,
          };
        }
        clearEmptyRetry();
        historyReadyRef.current = true;
        const cache = candleCacheRef.current;
        if (cache.size >= CANDLE_CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        cache.set(requestedMarketKey, candles);
        chartDebugLog('market', 'fetch-candles-ok', {
          coin: requestedCoin,
          interval,
          count: candles.length,
          attempt,
        });
        return {
          ...prev,
          candles,
          loading: false,
          error: null,
          fetchAttempts: attempt,
        };
      });
      if (shouldRetry && marketKeyRef.current === requestedMarketKey) {
        scheduleEmptyRetry('empty-or-thin-response', refreshCandles);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chart data unavailable';
      const isRateLimit = message.includes('429');
      let shouldRetry = false;
      chartDebugWarn('market', 'fetch-candles-fail', {
        coin: requestedCoin,
        interval,
        message,
        attempt,
      });
      setState((prev) => {
        if (marketKeyRef.current !== requestedMarketKey) return prev;
        shouldRetry = !isRateLimit || prev.candles.length < MIN_HISTORY_BARS;
        return {
          ...prev,
          loading: false,
          error:
            isRateLimit && prev.candles.length >= MIN_HISTORY_BARS ? null : message,
          fetchAttempts: attempt,
        };
      });
      if (shouldRetry && marketKeyRef.current === requestedMarketKey) {
        scheduleEmptyRetry('fetch-error', refreshCandles);
      }
    }
  }, [coin, interval, kind, enabled, marketKey, clearEmptyRetry, scheduleEmptyRetry]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestedCoin = normCoin(coin);
    const requestedMarketKey = marketKey;
    const attempt = emptyRetryRef.current + 1;
    chartDebugLog('market', 'refresh-start', { coin: requestedCoin, interval, kind, attempt });
    try {
      const [candles, book, snapshot, recentTrades] = await Promise.all([
        kind === 'spot'
          ? fetchHlSpotCandles(coin, interval, chartLookbackMs(interval))
          : fetchHlCandles(coin, interval, chartLookbackMs(interval)),
        kind === 'spot' ? fetchHlSpotOrderBook(coin) : fetchHlOrderBook(coin),
        kind === 'spot' ? fetchHlSpotMarketSnapshot(coin) : fetchHlMarketSnapshot(coin),
        kind === 'spot' ? fetchHlSpotRecentTrades(coin) : fetchHlRecentTrades(coin),
      ]);
      if (marketKeyRef.current !== requestedMarketKey) return;
      let shouldRetry = false;
      setState((prev) => {
        if (marketKeyRef.current !== requestedMarketKey) return prev;
        bookKeyRef.current = bookLevelsKey(book);
        if (candles.length < MIN_HISTORY_BARS) {
          shouldRetry = true;
          historyReadyRef.current = false;
          return {
            ...prev,
            book,
            snapshot,
            recentTrades: sortTapeTrades(
              recentTrades.filter((t) => coinMatches(t.coin, requestedCoin))
            ),
            loading: false,
            error:
              prev.candles.length >= MIN_HISTORY_BARS
                ? null
                : 'No candle data from Hyperliquid',
            wsConnected: false,
            fetchAttempts: attempt,
          };
        }
        clearEmptyRetry();
        historyReadyRef.current = true;
        const cache = candleCacheRef.current;
        if (cache.size >= CANDLE_CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        cache.set(requestedMarketKey, candles);
        chartDebugLog('market', 'refresh-ok', {
          coin: requestedCoin,
          interval,
          candleCount: candles.length,
          attempt,
        });
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
          fetchAttempts: attempt,
        };
      });
      if (shouldRetry && marketKeyRef.current === requestedMarketKey) {
        scheduleEmptyRetry('empty-or-thin-response', refreshCandles);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Market data unavailable';
      chartDebugWarn('market', 'refresh-fail', { coin: requestedCoin, interval, message, attempt });
      let shouldRetry = false;
      setState((prev) => {
        if (marketKeyRef.current !== requestedMarketKey) return prev;
        shouldRetry = prev.candles.length < MIN_HISTORY_BARS;
        return {
          ...prev,
          loading: false,
          error: message,
          fetchAttempts: attempt,
        };
      });
      if (shouldRetry && marketKeyRef.current === requestedMarketKey) {
        scheduleEmptyRetry('refresh-error', refreshCandles);
      }
    }
  }, [
    coin,
    interval,
    kind,
    enabled,
    marketKey,
    clearEmptyRetry,
    scheduleEmptyRetry,
    refreshCandles,
  ]);

  useEffect(() => {
    if (!enabled) {
      clearEmptyRetry();
      historyReadyRef.current = false;
      marketKeyRef.current = '';
      setState({
        candles: [],
        book: null,
        snapshot: null,
        recentTrades: [],
        loading: false,
        error: null,
        wsConnected: false,
        fetchAttempts: 0,
      });
      return;
    }
    clearEmptyRetry();
    historyReadyRef.current = false;
    marketKeyRef.current = marketKey;
    const coinChanged = coinKeyRef.current !== coinKey;
    coinKeyRef.current = coinKey;
    const cached = candleCacheRef.current.get(marketKey);
    setState((prev) => ({
      candles: cached ?? [],
      book: coinChanged ? null : prev.book,
      snapshot: coinChanged ? null : prev.snapshot,
      recentTrades: coinChanged ? [] : prev.recentTrades,
      loading: !cached,
      error: null,
      wsConnected: false,
      fetchAttempts: 0,
    }));
    chartDebugLog('market', 'market-change', {
      coin: normCoin(coin),
      interval,
      kind,
      marketKey,
    });
    void refresh();
  }, [coin, interval, kind, enabled, marketKey, coinKey, clearEmptyRetry, refresh]);

  useEffect(() => () => clearEmptyRetry(), [clearEmptyRetry]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => void refreshSnapshot(), SNAPSHOT_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshSnapshot, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => {
      const client = getHlWsClient();
      if (client.isLive()) return;
      void refreshBook();
    }, BOOK_FALLBACK_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshBook, enabled]);

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
    if (!historyReadyRef.current) return;
    if (marketKeyRef.current !== marketKey) return;
    setState((prev) => {
      const next = mergeCandle(prev.candles, bar);
      candleCacheRef.current.set(marketKey, next);
      return {
        ...prev,
        candles: next,
        wsConnected: true,
      };
    });
  }, [marketKey]);

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
    pendingBookRef.current = null;
    const key = bookLevelsKey(next);
    if (key === bookKeyRef.current) {
      setState((prev) => ({ ...prev, wsConnected: true }));
      return;
    }
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
          // Shared WS fans out every candle sub — reject other TFs (1m into 1h = wrong chart).
          const candleInterval = String(raw.i ?? '');
          if (candleInterval && candleInterval !== interval) continue;
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
