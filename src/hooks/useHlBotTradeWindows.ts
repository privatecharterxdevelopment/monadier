import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeHlPerpCoin } from '../lib/botTradingPairs';
import {
  botFillTidSet,
  buildHlBotTradeWindows,
  type HlBotMarkerRow,
  type HlBotTimeWindow,
} from '../lib/hyperliquid/splitHlActivity';
import { supabase } from '../lib/supabase';

/** Bot open/close intervals from hl_bot_chart_markers — used to split Perps vs Bot history. */
export function useHlBotTradeWindows(wallet: string | undefined, refreshKey = 0) {
  const [markers, setMarkers] = useState<HlBotMarkerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setMarkers([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hl_bot_chart_markers')
        .select('coin, event_type, event_ts, fill_tid, source')
        .eq('wallet_address', wallet.toLowerCase())
        .in('event_type', ['open', 'close'])
        .order('event_ts', { ascending: false })
        .limit(800);

      if (error) throw error;

      setMarkers(
        (data ?? []).map((r) => ({
          coin: normalizeHlPerpCoin(String(r.coin)),
          eventType: r.event_type as 'open' | 'close',
          eventMs: Date.parse(String(r.event_ts)) || 0,
          fillTid: r.fill_tid != null ? Number(r.fill_tid) : null,
          source: r.source != null ? String(r.source) : 'bot',
        }))
      );
    } catch (e) {
      console.warn('[useHlBotTradeWindows]', e);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!wallet) return undefined;
    const id = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [wallet, refresh]);

  const windows: HlBotTimeWindow[] = useMemo(
    () => buildHlBotTradeWindows(markers),
    [markers]
  );
  const fillTids = useMemo(() => botFillTidSet(markers), [markers]);

  return { windows, fillTids, markers, loading, refresh };
}
