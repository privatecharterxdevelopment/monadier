import { useCallback, useEffect, useState } from 'react';
import { fetchHlMarkPrices } from '../lib/hyperliquid/markets';

export function useHyperliquidMarkPrices(coins: string[], refreshMs = 5000) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const key = [...new Set(coins.filter(Boolean))].sort().join(',');

  const refresh = useCallback(async () => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) {
      setPrices({});
      return;
    }
    try {
      const next = await fetchHlMarkPrices(list);
      setPrices(next);
    } catch {
      /* keep last known prices */
    }
  }, [key]);

  useEffect(() => {
    void refresh();
    if (!key) return undefined;
    const id = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(id);
  }, [key, refresh, refreshMs]);

  return { prices, refresh };
}
