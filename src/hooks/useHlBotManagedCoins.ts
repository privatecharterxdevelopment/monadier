import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeHlPerpCoin } from '../lib/botTradingPairs';
import { isHlFillOpen } from '../lib/hyperliquid/format';
import { toNum } from '../lib/hyperliquid/parse';
import type { HlUserFill } from '../lib/hyperliquid/user';
import { supabase } from '../lib/supabase';

type LatestMarker = { type: 'open' | 'close'; ms: number };

/**
 * Coins the bot is managing for live Positions.
 * Primary: latest hl_bot_chart_markers event is open.
 * Fallback: still-open HL size after a close marker when a later Open fill exists
 * (reopen without open marker — previously hid the live position under “scanning”).
 */
export function useHlBotManagedCoins(
  wallet: string | undefined,
  refreshKey = 0,
  openPositionCoins: readonly string[] = [],
  fills: readonly HlUserFill[] = []
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
        .select('coin, event_type, event_ts')
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
        });
      }
      setLatestByCoin(latest);
    } catch (e) {
      console.warn('[useHlBotManagedCoins]', e);
      // Keep last known markers — clearing on poll errors hid open bot positions.
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
      if (row.type === 'open') open.add(coin);
    }

    // Reconcile: HL still has size, markers say closed, but a later Open fill exists
    // (bot reopened without a recorded open marker).
    for (const raw of openPositionCoins) {
      const coin = normalizeHlPerpCoin(raw);
      if (!coin || open.has(coin)) continue;
      const latest = latestByCoin.get(coin);
      if (!latest || latest.type !== 'close' || latest.ms <= 0) continue;
      const reopen = fills.some((f) => {
        if (normalizeHlPerpCoin(f.coin) !== coin) return false;
        if (!isHlFillOpen(f.dir)) return false;
        return toNum(f.time) > latest.ms;
      });
      if (reopen) open.add(coin);
    }

    return open;
  }, [latestByCoin, openPositionCoins, fills]);

  const has = useCallback((coin: string) => coins.has(normalizeHlPerpCoin(coin)), [coins]);

  return useMemo(
    () => ({ coins, loading, refresh, isBotManaged: has }),
    [coins, loading, refresh, has]
  );
}
