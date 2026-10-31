import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHlOutcomeCatalog, type HlOutcomeCatalog } from '../lib/hyperliquid/outcomes';
import { OUTCOME_CATALOG_POLL_MS } from '../lib/hyperliquid/outcomes/constants';

type RefreshOpts = {
  force?: boolean;
  background?: boolean;
};

export function useHyperliquidOutcomes(enabled = true) {
  const [catalog, setCatalog] = useState<HlOutcomeCatalog | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const refresh = useCallback(
    async (opts: RefreshOpts = {}) => {
      const { force = false, background = false } = opts;
      if (!enabled) return;

      const showBlockingLoader = !background || !catalogRef.current;
      if (showBlockingLoader) setLoading(true);
      setSyncing(true);
      if (!background) setError(null);

      try {
        const next = await fetchHlOutcomeCatalog(force);
        setCatalog(next);
        setUpdatedAt(Date.now());
        if (!background) setError(null);
      } catch (err: unknown) {
        if (!background || !catalogRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load outcome markets');
        }
      } finally {
        if (showBlockingLoader) setLoading(false);
        setSyncing(false);
      }
    },
    [enabled]
  );

  useEffect(() => {
    void refresh({ force: true });
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(
      () => void refresh({ force: true, background: true }),
      OUTCOME_CATALOG_POLL_MS
    );
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh({ force: true, background: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, refresh]);

  return {
    catalog,
    questions: catalog?.questions ?? [],
    loading,
    syncing,
    error,
    updatedAt,
    refresh,
  };
}
