import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  fetchBotPublicLeaderboard,
  fetchBotPublicLiveWins,
  fetchBotPublicRecentCloses,
  type BotPublicTradeRow,
} from '../lib/api/botPublicLeaderboard';

const DEFAULT_REFRESH_MS = 10_000;

type Options = {
  topLimit?: number;
  recentLimit?: number;
  refreshMs?: number;
};

export function useBotPublicLeaderboardData(opts: Options = {}) {
  const topLimit = opts.topLimit ?? 10;
  const recentLimit = opts.recentLimit ?? 8;
  const refreshMs = opts.refreshMs ?? DEFAULT_REFRESH_MS;

  const [topTrades, setTopTrades] = useState<BotPublicTradeRow[]>([]);
  const [liveTrades, setLiveTrades] = useState<BotPublicTradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [top, live] = await Promise.all([
      fetchBotPublicLeaderboard(topLimit),
      fetchBotPublicLiveWins(recentLimit),
    ]);
    setTopTrades(top);
    setLiveTrades(live);
    setLoading(false);
  }, [topLimit, recentLimit]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await load();
      if (cancelled) return;
    };

    void run();
    const id = window.setInterval(() => void load(), refreshMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    const channel = supabase
      .channel('public-bot-leaderboard')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_history' },
        () => {
          void load();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trade_history' },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [load, refreshMs]);

  return { topTrades, liveTrades, loading, reload: load };
}

export function useBotPublicLiveWins(limit = 12, refreshMs = DEFAULT_REFRESH_MS) {
  const [rows, setRows] = useState<BotPublicTradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const live = await fetchBotPublicLiveWins(limit);
    setRows(live);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await load();
      if (cancelled) return;
    };

    void run();
    const id = window.setInterval(() => void load(), refreshMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, refreshMs]);

  return { rows, loading, reload: load };
}

/** Latest bot closes including losses — single app leaderboard table. */
export function useBotPublicRecentCloses(limit = 40, refreshMs = DEFAULT_REFRESH_MS) {
  const [rows, setRows] = useState<BotPublicTradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const next = await fetchBotPublicRecentCloses(limit);
    setRows(next);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await load();
      if (cancelled) return;
    };

    void run();
    const id = window.setInterval(() => void load(), refreshMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    const channel = supabase
      .channel('public-bot-leaderboard-recent-all')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_history' },
        () => {
          void load();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trade_history' },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [load, refreshMs]);

  return { rows, loading, reload: load };
}
