import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type HlTradeReasonMarker = {
  coin: string;
  eventType: 'open' | 'close';
  direction: 'LONG' | 'SHORT';
  reason: string;
  eventTs: string;
  eventMs: number;
};

/** Bot open/close reasons from hl_bot_chart_markers (open reason stored in close_reason column). */
export function useHlTradeReasonMarkers(
  wallet: string | undefined,
  coins: string[],
  refreshKey = 0
) {
  const [markers, setMarkers] = useState<HlTradeReasonMarker[]>([]);
  const coinKey = useMemo(
    () => [...new Set(coins.map((c) => c.toUpperCase()))].sort().join(','),
    [coins]
  );

  const refresh = useCallback(async () => {
    if (!wallet || coins.length === 0) {
      setMarkers([]);
      return;
    }

    const walletLower = wallet.toLowerCase();
    const coinList = [...new Set(coins.map((c) => c.toUpperCase()))];

    try {
      const { data, error } = await supabase
        .from('hl_bot_chart_markers')
        .select('coin, event_type, direction, close_reason, event_ts')
        .eq('wallet_address', walletLower)
        .in('coin', coinList)
        .in('event_type', ['open', 'close'])
        .order('event_ts', { ascending: false })
        .limit(120);

      if (error) throw error;

      const mapped = (data ?? [])
        .filter((r) => r.close_reason?.trim())
        .map((r) => ({
          coin: String(r.coin).toUpperCase(),
          eventType: r.event_type as 'open' | 'close',
          direction: r.direction as 'LONG' | 'SHORT',
          reason: String(r.close_reason),
          eventTs: String(r.event_ts),
          eventMs: Date.parse(String(r.event_ts)) || 0,
        }));

      setMarkers(mapped);
    } catch (e) {
      console.warn('[useHlTradeReasonMarkers]', e);
      setMarkers([]);
    }
  }, [wallet, coinKey]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!wallet || coins.length === 0) return undefined;
    const id = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(id);
  }, [wallet, coinKey, refresh]);

  const openByCoin = useMemo(() => {
    const map = new Map<string, HlTradeReasonMarker>();
    for (const row of markers) {
      if (row.eventType !== 'open') continue;
      if (!map.has(row.coin)) map.set(row.coin, row);
    }
    return map;
  }, [markers]);

  const closeReasonForFill = useCallback(
    (coin: string, fillTimeMs: number): string | undefined => {
      const coinUpper = coin.toUpperCase();
      const closes = markers.filter(
        (m) => m.eventType === 'close' && m.coin === coinUpper
      );
      if (closes.length === 0) return undefined;
      let best: HlTradeReasonMarker | undefined;
      let bestDelta = Infinity;
      for (const c of closes) {
        const delta = Math.abs(c.eventMs - fillTimeMs);
        if (delta < bestDelta && delta <= 15 * 60 * 1000) {
          bestDelta = delta;
          best = c;
        }
      }
      return best?.reason;
    },
    [markers]
  );

  return { openByCoin, closeReasonForFill, refresh };
}
