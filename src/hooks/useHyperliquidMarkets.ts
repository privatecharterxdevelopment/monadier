import { useCallback, useEffect, useState } from 'react';
import { fetchHlMarkets, type HlMarket } from '../lib/hyperliquid/markets';

type State = {
  markets: HlMarket[];
  loading: boolean;
  error: string | null;
};

export function useHyperliquidMarkets(refreshMs = 5 * 60 * 1000) {
  const [state, setState] = useState<State>({
    markets: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const markets = await fetchHlMarkets();
      setState({ markets, loading: false, error: null });
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Markets unavailable',
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(id);
  }, [refresh, refreshMs]);

  return { ...state, refresh };
}
