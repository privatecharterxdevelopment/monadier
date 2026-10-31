import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { syncBettingTradesToSupabase } from '../lib/betting/syncBettingTrades';
import {
  mapBettingCloseRow,
  mapBettingPositionRow,
  type HlBettingCloseRow,
  type HlBettingPositionRow,
} from '../lib/betting/types';
import { useHyperliquidOutcomes } from './useHyperliquidOutcomes';
import { OUTCOME_POSITIONS_POLL_MS } from '../lib/hyperliquid/outcomes/constants';
import { devError, isHlRateLimitError } from '../lib/devLog';

type Options = {
  walletAddress?: string;
  enabled?: boolean;
  /** Trigger background sync from HL → Supabase */
  syncFromHl?: boolean;
};

export function useBettingPortfolio({
  walletAddress,
  enabled = true,
  syncFromHl = true,
}: Options) {
  const { user } = useAuth();
  const { catalog } = useHyperliquidOutcomes(enabled);
  const [openBets, setOpenBets] = useState<HlBettingPositionRow[]>([]);
  const [closedBets, setClosedBets] = useState<HlBettingCloseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromDb = useCallback(async () => {
    if (!user) {
      setOpenBets([]);
      setClosedBets([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let openQuery = supabase
        .from('hl_betting_positions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      let closedQuery = supabase
        .from('hl_betting_closes')
        .select('*')
        .eq('user_id', user.id)
        .order('closed_at', { ascending: false })
        .limit(100);

      if (walletAddress) {
        const w = walletAddress.toLowerCase();
        openQuery = openQuery.eq('wallet_address', w);
        closedQuery = closedQuery.eq('wallet_address', w);
      }

      const [openRes, closedRes] = await Promise.all([openQuery, closedQuery]);

      if (openRes.error) throw openRes.error;
      if (closedRes.error) throw closedRes.error;

      setOpenBets((openRes.data ?? []).map((r) => mapBettingPositionRow(r as Record<string, unknown>)));
      setClosedBets((closedRes.data ?? []).map((r) => mapBettingCloseRow(r as Record<string, unknown>)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load betting history');
    } finally {
      setLoading(false);
    }
  }, [user, walletAddress]);

  const sync = useCallback(async () => {
    if (!syncFromHl || !user || !walletAddress || !catalog) {
      await loadFromDb();
      return;
    }
    if (document.visibilityState === 'hidden') {
      await loadFromDb();
      return;
    }

    setSyncing(true);
    try {
      await syncBettingTradesToSupabase(user.id, walletAddress, catalog);
      await loadFromDb();
    } catch (err: unknown) {
      if (!isHlRateLimitError(err)) devError('[useBettingPortfolio] sync', err);
      await loadFromDb();
    } finally {
      setSyncing(false);
    }
  }, [syncFromHl, user, walletAddress, catalog, loadFromDb]);

  useEffect(() => {
    void sync();
  }, [sync]);

  useEffect(() => {
    if (!enabled || !user || !walletAddress || !syncFromHl) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void sync();
    }, OUTCOME_POSITIONS_POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, user, walletAddress, syncFromHl, sync]);

  const summary = useMemo(() => {
    const openStake = openBets.reduce((s, b) => s + b.entry_ntl, 0);
    const openUpnl = openBets.reduce((s, b) => s + (b.unrealized_pnl ?? 0), 0);
    const realizedPnl = closedBets.reduce((s, b) => s + b.realized_pnl, 0);
    const wins = closedBets.filter((b) => b.realized_pnl > 0).length;
    const losses = closedBets.filter((b) => b.realized_pnl < 0).length;
    return { openStake, openUpnl, realizedPnl, wins, losses };
  }, [openBets, closedBets]);

  return {
    openBets,
    closedBets,
    loading,
    syncing,
    error,
    summary,
    signedIn: Boolean(user),
    refresh: sync,
  };
}
