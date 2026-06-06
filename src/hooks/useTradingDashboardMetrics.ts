import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { supabase } from '../lib/supabase';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { VaultClient, VAULT_CHAIN_ID } from '../lib/vault';
import { useWeb3 } from '../contexts/Web3Context';

export type TradingDashboardMetrics = {
  vaultBalanceUsd: number;
  openPositionValueUsd: number;
  openPositionsCount: number;
  avgLeverage: number;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  pnl24h: number;
  pnl7d: number;
  pnl30d: number;
  winRate: number;
  closedTradesCount: number;
  autoTradeEnabled: boolean;
  withdrawableUsd: number;
  isLoading: boolean;
};

const defaultMetrics: TradingDashboardMetrics = {
  vaultBalanceUsd: 0,
  openPositionValueUsd: 0,
  openPositionsCount: 0,
  avgLeverage: 1,
  totalPnl: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  pnl24h: 0,
  pnl7d: 0,
  pnl30d: 0,
  winRate: 0,
  autoTradeEnabled: false,
  withdrawableUsd: 0,
  isLoading: true,
};

function pnlInWindow(
  positions: { profit_loss: number | null; closed_at: string | null; status: string }[],
  hours: number
) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return positions
    .filter((p) => p.status === 'closed' && p.closed_at && new Date(p.closed_at).getTime() >= cutoff)
    .reduce((sum, p) => sum + (p.profit_loss || 0), 0);
}

export function useTradingDashboardMetrics() {
  const { address } = useAccount();
  const { isDemoUser } = useAuth();
  const { publicClient, walletClient } = useWeb3();
  const [metrics, setMetrics] = useState<TradingDashboardMetrics>(defaultMetrics);

  const refresh = useCallback(async () => {
    if (!isDemoUser) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMetrics({ ...defaultMetrics, isLoading: false });
        return;
      }
    }

    setMetrics((m) => ({ ...m, isLoading: true }));

    try {
      const wallets = new Set<string>();
      if (isDemoUser) {
        wallets.add(DEMO_WALLET_ADDRESS);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: walletRows } = await supabase
            .from('user_wallets')
            .select('wallet_address')
            .eq('user_id', user.id);
          walletRows?.forEach((w) => wallets.add(w.wallet_address.toLowerCase()));

          const { data: profile } = await supabase
            .from('profiles')
            .select('wallet_address')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.wallet_address?.trim()) {
            wallets.add(profile.wallet_address.toLowerCase());
          }
        }
      }

      const walletArray = Array.from(wallets);

      if (!isDemoUser && walletArray.length === 0) {
        setMetrics({ ...defaultMetrics, isLoading: false });
        return;
      }

      const { data: positions } = await supabase
        .from('positions')
        .select('*')
        .in('wallet_address', walletArray);

      let vaultSettings: { auto_trade_enabled?: boolean } | null = null;
      if (walletArray[0]) {
        const { data } = await supabase
          .from('vault_settings')
          .select('auto_trade_enabled')
          .eq('wallet_address', walletArray[0])
          .maybeSingle();
        vaultSettings = data;
      }

      const all = positions || [];
      const open = all.filter((p) => p.status === 'open' || p.status === 'closing');
      const closed = all.filter((p) => p.status === 'closed');

      const openValue = open.reduce(
        (sum, p) => sum + (p.entry_amount || 0) * (p.leverage_multiplier || 1),
        0
      );
      const avgLev =
        open.length > 0
          ? open.reduce((s, p) => s + (p.leverage_multiplier || 1), 0) / open.length
          : 1;

      const closedProfit = closed.reduce((sum, p) => sum + (p.profit_loss || 0), 0);
      const openProfit = open.reduce((sum, p) => sum + (p.profit_loss || 0), 0);
      const realizedPnl = closedProfit;
      const unrealizedPnl = openProfit;
      const wins = closed.filter((p) => (p.profit_loss || 0) > 0).length;

      let vaultBalanceUsd = 0;
      let withdrawableUsd = 0;

      const queryWallet = (isDemoUser ? DEMO_WALLET_ADDRESS : address) as `0x${string}` | undefined;
      if (queryWallet && publicClient && walletClient) {
        try {
          const client = new VaultClient(publicClient as never, walletClient as never, VAULT_CHAIN_ID);
          const status = await client.getUserStatus(queryWallet);
          vaultBalanceUsd = parseFloat(status.balanceFormatted || '0');
          try {
            const w = await client.getWithdrawable(queryWallet);
            withdrawableUsd = parseFloat(w.formatted || '0');
          } catch {
            withdrawableUsd = vaultBalanceUsd;
          }
        } catch {
          /* vault read optional */
        }
      }

      setMetrics({
        vaultBalanceUsd,
        openPositionValueUsd: openValue,
        openPositionsCount: open.length,
        avgLeverage: avgLev,
        totalPnl: closedProfit + openProfit,
        realizedPnl,
        unrealizedPnl,
        pnl24h: pnlInWindow(all, 24),
        pnl7d: pnlInWindow(all, 24 * 7),
        pnl30d: pnlInWindow(all, 24 * 30),
        winRate: closed.length ? (wins / closed.length) * 100 : 0,
        closedTradesCount: closed.length,
        autoTradeEnabled: vaultSettings?.auto_trade_enabled ?? false,
        withdrawableUsd,
        isLoading: false,
      });
    } catch (e) {
      console.error('[useTradingDashboardMetrics]', e);
      setMetrics((m) => ({ ...m, isLoading: false }));
    }
  }, [address, isDemoUser, publicClient, walletClient]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  return { metrics, refresh };
}
