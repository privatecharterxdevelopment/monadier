import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHlMarkPrices } from '../lib/hyperliquid/markets';
import { getHlWsClient } from '../lib/hyperliquid/ws';
import { toNum } from '../lib/hyperliquid/parse';

const REST_FALLBACK_MS = 4_000;
const WS_STALE_MS = 15_000;

export function useHyperliquidMarkPrices(coins: string[], refreshMs = 800) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const key = [...new Set(coins.filter(Boolean))].sort().join(',');
  const lastWsAt = useRef(0);
  const coinsRef = useRef<string[]>([]);
  coinsRef.current = key ? key.split(',') : [];

  const applyMids = useCallback((mids: Record<string, unknown>) => {
    const list = coinsRef.current;
    if (list.length === 0) return;
    let touched = false;
    setPrices((prev) => {
      const next = { ...prev };
      for (const coin of list) {
        const raw = mids[coin] ?? mids[`${coin}-PERP`];
        const px = toNum(raw as string | number);
        if (px > 0) {
          next[coin] = px;
          touched = true;
        }
      }
      return touched ? next : prev;
    });
    if (touched) lastWsAt.current = Date.now();
  }, []);

  const refreshRest = useCallback(async () => {
    const list = coinsRef.current;
    if (list.length === 0) {
      setPrices({});
      return;
    }
    try {
      const next = await fetchHlMarkPrices(list);
      setPrices((prev) => ({ ...prev, ...next }));
    } catch {
      /* keep last known prices */
    }
  }, []);

  useEffect(() => {
    void refreshRest();
    if (!key) return undefined;

    const client = getHlWsClient();
    const unsubWs = client.subscribe({ type: 'allMids' });
    const off = client.addListener((channel, data) => {
      if (channel !== 'allMids') return;
      if (data && typeof data === 'object') {
        applyMids(data as Record<string, unknown>);
      }
    });

    const restId = window.setInterval(() => {
      const wsFresh = Date.now() - lastWsAt.current < WS_STALE_MS;
      if (wsFresh && client.isLive(WS_STALE_MS)) return;
      void refreshRest();
    }, Math.max(refreshMs, REST_FALLBACK_MS));

    return () => {
      unsubWs();
      off();
      window.clearInterval(restId);
    };
  }, [key, refreshMs, refreshRest, applyMids]);

  return { prices, refresh: refreshRest };
}
