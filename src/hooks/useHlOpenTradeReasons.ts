import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type HlOpenTradeReason = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  reason: string;
  eventTs: string;
};

/** Latest bot open reason per coin from hl_bot_chart_markers (stored in close_reason on open events). */
export function useHlOpenTradeReasons(
  wallet: string | undefined,
  coins: string[],
  refreshKey = 0
) {
  const [rows, setRows] = useState<HlOpenTradeReason[]>([]);
  const coinKey = useMemo(
    () => [...new Set(coins.map((c) => c.toUpperCase()))].sort().join(','),
    [coins]
  );

  const refresh = useCallback(async () => {
    if (!wallet || coins.length === 0) {
      setRows([]);
      return;
    }

    const walletLower = wallet.toLowerCase();
    const coinList = [...new Set(coins.map((c) => c.toUpperCase()))];

    try {
      const { data, error } = await supabase
        .from('hl_bot_chart_markers')
        .select('coin, direction, close_reason, event_ts')
        .eq('wallet_address', walletLower)
        .eq('event_type', 'open')
        .in('coin', coinList)
        .order('event_ts', { ascending: false })
        .limit(80);

      if (error) throw error;

      const mapped = (data ?? [])
        .filter((r) => r.close_reason?.trim())
        .map((r) => ({
          coin: String(r.coin).toUpperCase(),
          direction: r.direction as 'LONG' | 'SHORT',
          reason: String(r.close_reason),
          eventTs: String(r.event_ts),
        }));

      setRows(mapped);
    } catch (e) {
      console.warn('[useHlOpenTradeReasons]', e);
      setRows([]);
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

  const byCoin = useMemo(() => {
    const map = new Map<string, HlOpenTradeReason>();
    for (const row of rows) {
      if (!map.has(row.coin)) map.set(row.coin, row);
    }
    return map;
  }, [rows]);

  return { byCoin, refresh };
}
