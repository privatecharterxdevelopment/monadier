import { useCallback, useEffect, useState } from 'react';
import { fetchHlSpotMarkets, type HlSpotMarket } from '../lib/hyperliquid/spot';

type State = {
  markets: HlSpotMarket[];
  loading: boolean;
  error: string | null;
};

export function useHyperliquidSpotMarkets(refreshMs = 5 * 60 * 1000) {
  const [state, setState] = useState<State>({
    markets: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const markets = await fetchHlSpotMarkets();
      setState({ markets, loading: false, error: null });
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Spot markets unavailable',
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
