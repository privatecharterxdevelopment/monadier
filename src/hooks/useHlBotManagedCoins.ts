import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeHlPerpCoin } from '../lib/botTradingPairs';
import { supabase } from '../lib/supabase';

/** Coins whose latest hl_bot_chart_markers event is an open (bot-managed). */
export function useHlBotManagedCoins(wallet: string | undefined, refreshKey = 0) {
  const [coins, setCoins] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setCoins(new Set());
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hl_bot_chart_markers')
        .select('coin, event_type, event_ts')
        .eq('wallet_address', wallet.toLowerCase())
        .in('event_type', ['open', 'close'])
        .order('event_ts', { ascending: false })
        .limit(400);

      if (error) throw error;

      const latest = new Map<string, 'open' | 'close'>();
      for (const row of data ?? []) {
        const coin = normalizeHlPerpCoin(String(row.coin));
        if (!coin || latest.has(coin)) continue;
        latest.set(coin, row.event_type as 'open' | 'close');
      }

      const open = new Set<string>();
      for (const [coin, type] of latest) {
        if (type === 'open') open.add(coin);
      }
      setCoins(open);
    } catch (e) {
      console.warn('[useHlBotManagedCoins]', e);
      // Keep last known managed coins — clearing on poll errors hid open bot positions.
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

  const has = useCallback((coin: string) => coins.has(normalizeHlPerpCoin(coin)), [coins]);

  return useMemo(
    () => ({ coins, loading, refresh, isBotManaged: has }),
    [coins, loading, refresh, has]
  );
}
