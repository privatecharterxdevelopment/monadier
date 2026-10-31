import { useEffect, useState } from 'react';
import {
  BENTO_MARKETS,
  fetchBentoMarketQuotes,
  type BentoMarketQuote,
} from '../lib/landing/bentoMarketData';

const TICKER_MS = 12_000;
const KLINES_MS = 60_000;

export function useBentoMarketCharts() {
  const [quotes, setQuotes] = useState<BentoMarketQuote[]>(() =>
    BENTO_MARKETS.map((m) => ({
      id: m.id,
      symbol: m.symbol,
      pairLabel: m.pairLabel,
      name: m.name,
      price: 0,
      openPrice24h: 0,
      change24hPct: 0,
      volumeChangePct: 0,
      sparkline: [],
    }))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let lastKlinesAt = 0;

    const load = async (forceKlines: boolean) => {
      try {
        const next = await fetchBentoMarketQuotes();
        if (cancelled) return;
        setQuotes(next);
        setError(false);
        if (forceKlines) lastKlinesAt = Date.now();
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load(true);

    const id = window.setInterval(() => {
      const refreshKlines = Date.now() - lastKlinesAt >= KLINES_MS;
      void load(refreshKlines);
    }, TICKER_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { quotes, loading, error };
}
