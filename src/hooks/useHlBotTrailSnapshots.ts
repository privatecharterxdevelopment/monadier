import { useEffect, useState } from 'react';
import {
  fetchHlBotTrailSnapshots,
  type HlBotTrailSnapshot,
} from '../lib/hlBotTrailStatus';

/** Bot-side profit trail truth (peak, stop, close trigger). */
export function useHlBotTrailSnapshots(
  wallet: string | null | undefined,
  enabled = true,
  pollMs = 3000
): Record<string, HlBotTrailSnapshot> {
  const [byCoin, setByCoin] = useState<Record<string, HlBotTrailSnapshot>>({});

  useEffect(() => {
    if (!enabled || !wallet) {
      setByCoin({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      const trails = await fetchHlBotTrailSnapshots(wallet);
      if (cancelled) return;
      const next: Record<string, HlBotTrailSnapshot> = {};
      for (const t of trails) next[t.coin] = t;
      setByCoin(next);
    };

    void load();
    const id = window.setInterval(() => void load(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [wallet, enabled, pollMs]);

  return byCoin;
}
