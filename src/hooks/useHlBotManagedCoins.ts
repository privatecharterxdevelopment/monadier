import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeHlPerpCoin } from '../lib/botTradingPairs';
import { supabase } from '../lib/supabase';

type LatestMarker = { type: 'open' | 'close'; ms: number; source: string };

/**
 * Coins HyperGain is managing for live Bot Positions.
 * Only the latest hl_bot_chart_markers event: open + not manual.
 * Untagged Hyperliquid fills and desk manuals belong on Perps — the bot must
 * not adopt them (that used to auto-close user trades).
 */
export function useHlBotManagedCoins(
  wallet: string | undefined,
  refreshKey = 0,
  _openPositionCoins: readonly string[] = [],
  _fills: readonly unknown[] = []
) {
  const [latestByCoin, setLatestByCoin] = useState<Map<string, LatestMarker>>(new Map());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setLatestByCoin(new Map());
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hl_bot_chart_markers')
        .select('coin, event_type, event_ts, source')
        .eq('wallet_address', wallet.toLowerCase())
        .in('event_type', ['open', 'close'])
        .order('event_ts', { ascending: false })
        .limit(400);

      if (error) throw error;

      const latest = new Map<string, LatestMarker>();
      for (const row of data ?? []) {
        const coin = normalizeHlPerpCoin(String(row.coin));
        if (!coin || latest.has(coin)) continue;
        const ms = Date.parse(String(row.event_ts)) || 0;
        latest.set(coin, {
          type: row.event_type as 'open' | 'close',
          ms,
          source: String(row.source ?? 'bot'),
        });
      }
      setLatestByCoin(latest);
    } catch (e) {
      console.warn('[useHlBotManagedCoins]', e);
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

  const coins = useMemo(() => {
    const open = new Set<string>();
    for (const [coin, row] of latestByCoin) {
      if (row.type === 'open' && row.source !== 'manual') open.add(coin);
    }
    return open;
  }, [latestByCoin]);

  const has = useCallback((coin: string) => coins.has(normalizeHlPerpCoin(coin)), [coins]);

  return useMemo(
    () => ({ coins, loading, refresh, isBotManaged: has }),
    [coins, loading, refresh, has]
  );
}
