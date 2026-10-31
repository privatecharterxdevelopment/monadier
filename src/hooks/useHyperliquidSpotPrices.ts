import { useCallback, useEffect, useState } from 'react';
import { fetchHlSpotTokenPrices } from '../lib/hyperliquid/spot';

export function useHyperliquidSpotPrices(tokens: string[], refreshMs = 60_000) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const unique = [...new Set(tokens.filter(Boolean))];
    if (unique.length === 0) {
      setPrices({});
      return;
    }
    setLoading(true);
    try {
      setPrices(await fetchHlSpotTokenPrices(unique));
    } catch {
      /* keep last prices */
    } finally {
      setLoading(false);
    }
  }, [tokens]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(id);
  }, [refresh, refreshMs]);

  return { prices, loading, refresh };
}
