import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type HlTradeReasonMarker = {
  coin: string;
  eventType: 'open' | 'close';
  direction: 'LONG' | 'SHORT';
  reason: string;
  eventTs: string;
  eventMs: number;
  entryPx?: number | null;
};

function pickOpenReasonForPosition(
  markers: HlTradeReasonMarker[],
  coin: string,
  entryPx: number,
  openedMs?: number
): string | undefined {
  const coinUpper = coin.toUpperCase();
  const opens = markers.filter((m) => m.eventType === 'open' && m.coin === coinUpper);
  if (opens.length === 0) return undefined;

  const entryTol = Math.max(entryPx * 0.004, 1e-8);
  let best: HlTradeReasonMarker | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const row of opens) {
    let score = 0;
    if (row.entryPx != null && entryPx > 0) {
      const pxDiff = Math.abs(row.entryPx - entryPx);
      if (pxDiff > entryTol * 4) continue;
      score += pxDiff / Math.max(entryTol, 1e-12);
    }
    if (openedMs != null && openedMs > 0 && row.eventMs > 0) {
      const tDiff = Math.abs(row.eventMs - openedMs);
      if (tDiff > 6 * 3_600_000) continue;
      score += tDiff / 60_000;
    }
    if (score < bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (best?.reason?.trim()) return best.reason.trim();
  const fallback = opens.find((o) => o.reason?.trim());
  return fallback?.reason.trim();
}

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
      const [markerRes, auditRes] = await Promise.all([
        supabase
          .from('hl_bot_chart_markers')
          .select('coin, event_type, direction, close_reason, event_ts, price')
          .eq('wallet_address', walletLower)
          .in('coin', coinList)
          .in('event_type', ['open', 'close'])
          .order('event_ts', { ascending: false })
          .limit(120),
        supabase
          .from('hl_open_audits')
          .select('coin, direction, analysis_text, recorded_at, entry_px')
          .eq('wallet_address', walletLower)
          .in('coin', coinList)
          .order('recorded_at', { ascending: false })
          .limit(120),
      ]);

      if (markerRes.error) throw markerRes.error;

      const mapped = (markerRes.data ?? [])
        .filter((r) => r.close_reason?.trim())
        .map((r) => ({
          coin: String(r.coin).toUpperCase(),
          eventType: r.event_type as 'open' | 'close',
          direction: r.direction as 'LONG' | 'SHORT',
          reason: String(r.close_reason),
          eventTs: String(r.event_ts),
          eventMs: Date.parse(String(r.event_ts)) || 0,
          entryPx: Number(r.price) > 0 ? Number(r.price) : null,
        }));

      for (const row of auditRes.data ?? []) {
        if (!row.analysis_text?.trim()) continue;
        const entryPx = Number(row.entry_px);
        mapped.push({
          coin: String(row.coin).toUpperCase(),
          eventType: 'open',
          direction: row.direction as 'LONG' | 'SHORT',
          reason: String(row.analysis_text),
          eventTs: String(row.recorded_at),
          eventMs: Date.parse(String(row.recorded_at)) || 0,
          entryPx: Number.isFinite(entryPx) && entryPx > 0 ? entryPx : null,
        });
      }

      mapped.sort((a, b) => b.eventMs - a.eventMs);

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
    const id = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(id);
  }, [wallet, coinKey, refresh]);

  useEffect(() => {
    if (!wallet) return undefined;
    const walletLower = wallet.toLowerCase();
    const channel = supabase
      .channel(`hl-reason-markers-${walletLower.slice(0, 12)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hl_bot_chart_markers',
          filter: `wallet_address=eq.${walletLower}`,
        },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hl_open_audits',
          filter: `wallet_address=eq.${walletLower}`,
        },
        () => void refresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [wallet, refresh]);

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

  const openReasonForPosition = useCallback(
    (coin: string, entryPx: number, openedMs?: number) =>
      pickOpenReasonForPosition(markers, coin, entryPx, openedMs),
    [markers]
  );

  return { openByCoin, openReasonForPosition, closeReasonForFill, refresh };
}
