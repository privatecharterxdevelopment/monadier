import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { fetchUserWalletAddresses } from '../lib/userWallets';
import { calcPositionPnl, fetchLiveTokenPrices } from '../lib/positionLivePnl';
import { supabase } from '../lib/supabase';

type OpenRow = {
  status: string;
  entry_price: number;
  entry_amount: number;
  token_symbol: string;
  direction: string;
  highest_price: number | null;
  profit_loss: number | null;
  leverage_multiplier: number | null;
};

export type BotPositionBadge = {
  count: number;
  netPnl: number;
  tone: 'pos' | 'neg' | null;
  loading: boolean;
};

const EMPTY: BotPositionBadge = { count: 0, netPnl: 0, tone: null, loading: true };

export function useBotPositionBadge(refreshKey = 0) {
  const { address } = useAccount();
  const { isDemoUser } = useAuth();
  const [badge, setBadge] = useState<BotPositionBadge>(EMPTY);

  const refresh = useCallback(async () => {
    try {
      const wallets = await fetchUserWalletAddresses(address, isDemoUser);
      const queryWallets =
        wallets.length > 0 ? wallets : isDemoUser ? [DEMO_WALLET_ADDRESS] : [];
      if (queryWallets.length === 0) {
        setBadge({ count: 0, netPnl: 0, tone: null, loading: false });
        return;
      }

      const { data, error } = await supabase
        .from('positions')
        .select(
          'status, entry_price, entry_amount, token_symbol, direction, highest_price, profit_loss, leverage_multiplier'
        )
        .in('wallet_address', queryWallets)
        .in('status', ['open', 'closing']);

      if (error) throw error;

      const rows = (data as OpenRow[]) || [];
      const prices = await fetchLiveTokenPrices();
      const netPnl = rows.reduce((sum, row) => sum + calcPositionPnl(row, prices), 0);
      const count = rows.length;

      setBadge({
        count,
        netPnl,
        tone: count > 0 ? (netPnl >= 0 ? 'pos' : 'neg') : null,
        loading: false,
      });
    } catch (e) {
      console.warn('[useBotPositionBadge]', e);
      setBadge((prev) => ({ ...prev, loading: false }));
    }
  }, [address, isDemoUser]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { badge, refresh };
}
