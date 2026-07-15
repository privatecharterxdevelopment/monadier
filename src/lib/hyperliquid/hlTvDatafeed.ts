import { fetchHlCandles } from './api';
import { chartLookbackMs } from './chartZoom';
import { fetchHlSpotCandles, isHlSpotCoin } from './spot';
import { getHlWsClient } from './ws';
import type { HlCandleBar, HlInterval } from './types';

type TvResolution = string;

type LibrarySymbolInfo = {
  name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_daily: boolean;
  supported_resolutions: TvResolution[];
  volume_precision: number;
  data_status: string;
};

type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type HistoryMeta = {
  noData?: boolean;
};

type OnReadyCallback = (config: Record<string, unknown>) => void;
type ResolveCallback = (info: LibrarySymbolInfo) => void;
type HistoryCallback = (bars: Bar[], meta?: HistoryMeta) => void;
type ErrorCallback = (reason: string) => void;
type SubscribeBarsCallback = (bar: Bar) => void;

const SUPPORTED_RESOLUTIONS = ['1', '5', '15', '60', '240', 'D'];

const RESOLUTION_TO_INTERVAL: Record<string, HlInterval> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  D: '1d',
};

type SubState = {
  coin: string;
  interval: HlInterval;
  resolution: TvResolution;
  onTick: SubscribeBarsCallback;
  unsub?: () => void;
};

function barFromHl(c: HlCandleBar): Bar {
  return {
    time: c.time * 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

function pricescaleForCoin(coin: string): number {
  const upper = coin.toUpperCase();
  if (upper === 'BTC') return 10;
  if (['ETH', 'SOL', 'BNB'].includes(upper)) return 100;
  return 10_000;
}

function coinMatches(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

async function fetchBars(coin: string, interval: HlInterval): Promise<HlCandleBar[]> {
  const lookback = chartLookbackMs(interval);
  if (isHlSpotCoin(coin)) return fetchHlSpotCandles(coin, interval);
  return fetchHlCandles(coin, interval, lookback);
}

/** TradingView Charting Library datafeed backed by Hyperliquid APIs. */
export class HyperliquidTvDatafeed {
  private subs = new Map<string, SubState>();

  onReady(callback: OnReadyCallback) {
    window.setTimeout(() => {
      callback({
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
      });
    }, 0);
  }

  searchSymbols(
    userInput: string,
    _exchange: string,
    _symbolType: string,
    onResult: (items: Array<{ symbol: string; full_name: string; description: string; exchange: string; ticker: string; type: string }>) => void
  ) {
    const q = userInput.trim().toUpperCase();
    if (!q) {
      onResult([]);
      return;
    }
    onResult([
      {
        symbol: q,
        full_name: `HL:${q}`,
        description: `${q} Hyperliquid`,
        exchange: 'Hyperliquid',
        ticker: q,
        type: 'crypto',
      },
    ]);
  }

  resolveSymbol(symbolName: string, onResolve: ResolveCallback, onError: ErrorCallback) {
    const coin = symbolName.replace(/^HL:/i, '').split('-')[0]?.trim();
    if (!coin) {
      onError('Invalid symbol');
      return;
    }

    const info: LibrarySymbolInfo = {
      name: coin,
      ticker: coin,
      description: `${coin} · Hyperliquid`,
      type: 'crypto',
      session: '24x7',
      timezone: 'Etc/UTC',
      exchange: 'Hyperliquid',
      minmov: 1,
      pricescale: pricescaleForCoin(coin),
      has_intraday: true,
      has_daily: true,
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      volume_precision: 4,
      data_status: 'streaming',
    };

    window.setTimeout(() => onResolve(info), 0);
  }

  getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: TvResolution,
    periodParams: { from: number; to: number; countBack?: number; firstDataRequest?: boolean },
    onResult: HistoryCallback,
    onError: ErrorCallback
  ) {
    const interval = RESOLUTION_TO_INTERVAL[resolution];
    if (!interval) {
      onError(`Unsupported resolution: ${resolution}`);
      return;
    }

    void (async () => {
      try {
        const rows = await fetchBars(symbolInfo.name, interval);
        const fromMs = periodParams.from * 1000;
        const toMs = periodParams.to * 1000;
        const filtered = rows
          .filter((b) => b.time * 1000 >= fromMs && b.time * 1000 <= toMs)
          .map(barFromHl);

        onResult(filtered, { noData: filtered.length === 0 });
      } catch (err: unknown) {
        onError(err instanceof Error ? err.message : 'History failed');
      }
    })();
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: TvResolution,
    onTick: SubscribeBarsCallback,
    listenerGuid: string
  ) {
    const interval = RESOLUTION_TO_INTERVAL[resolution];
    if (!interval) return;

    const coin = symbolInfo.name;
    const client = getHlWsClient();
    const unsub = client.subscribe({ type: 'candle', coin, interval });

    const off = client.addListener((channel, data) => {
      if (channel !== 'candle') return;
      const rows = Array.isArray(data) ? data : [data];
      for (const row of rows) {
        const raw = row as Record<string, unknown>;
        const candleCoin = String(raw.s ?? raw.coin ?? '');
        if (candleCoin && !coinMatches(candleCoin, coin)) continue;
        const candleInterval = String(raw.i ?? '');
        if (candleInterval && candleInterval !== interval) continue;
        const t = Number(raw.t);
        if (!Number.isFinite(t) || t <= 0) continue;
        onTick({
          time: t,
          open: Number(raw.o),
          high: Number(raw.h),
          low: Number(raw.l),
          close: Number(raw.c),
          volume: Number(raw.v ?? 0),
        });
      }
    });

    this.subs.set(listenerGuid, {
      coin,
      interval,
      resolution,
      onTick,
      unsub: () => {
        unsub();
        off();
      },
    });
  }

  unsubscribeBars(listenerGuid: string) {
    const sub = this.subs.get(listenerGuid);
    sub?.unsub?.();
    this.subs.delete(listenerGuid);
  }
}
