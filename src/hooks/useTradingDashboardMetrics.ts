import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { supabase } from '../lib/supabase';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { VaultClient, VAULT_CHAIN_ID, getArbitrumPublicClient } from '../lib/vault';
import { useWeb3 } from '../contexts/Web3Context';
import { pickPrimaryVaultWallet } from '../lib/userWallets';
import { fetchUserPositions } from '../lib/userPositions';
import {
  computePositionStats,
  fetchLiveTokenPrices,
  type PositionPnlRow,
} from '../lib/positionLivePnl';

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
  const { isDemoUser, user } = useAuth();
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
      const [all, livePrices] = await Promise.all([
        fetchUserPositions({
          isDemoUser,
          connectedAddress: address,
          userId: user?.id,
        }),
        fetchLiveTokenPrices(),
      ]);

      const open = all.filter((p) => p.status === 'open' || p.status === 'closing');
      const stats = computePositionStats(all as PositionPnlRow[], livePrices);

      const openValue = open.reduce(
        (sum, p) => sum + (p.entry_amount || 0) * (p.leverage_multiplier || 1),
        0
      );
      const avgLev =
        open.length > 0
          ? open.reduce((s, p) => s + (p.leverage_multiplier || 1), 0) / open.length
          : 1;

      const walletArray = [
        ...new Set(all.map((p) => p.wallet_address.toLowerCase()).filter(Boolean)),
      ];
      if (isDemoUser) {
        walletArray.push(DEMO_WALLET_ADDRESS);
      } else if (address) {
        walletArray.push(address.toLowerCase());
      }

      const primaryWallet = pickPrimaryVaultWallet(
        [...new Set(walletArray)],
        address
      );
      let vaultSettings: { auto_trade_enabled?: boolean } | null = null;

      let vaultBalanceUsd = 0;
      let withdrawableUsd = 0;

      const queryWallet = (
        isDemoUser
          ? DEMO_WALLET_ADDRESS
          : (address?.toLowerCase() ?? primaryWallet)
      ) as `0x${string}` | undefined;

      let onChainAutoTrade = false;
      if (queryWallet) {
        try {
          const arbClient = getArbitrumPublicClient();
          const client = new VaultClient(
            arbClient as never,
            (walletClient ?? arbClient) as never,
            VAULT_CHAIN_ID
          );
          const status = await client.getUserStatus(queryWallet);
          vaultBalanceUsd = parseFloat(status.balanceFormatted || '0');
          onChainAutoTrade = status.autoTradeEnabled;
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

      if (primaryWallet) {
        const { data } = await supabase
          .from('vault_settings')
          .select('auto_trade_enabled')
          .eq('wallet_address', primaryWallet)
          .maybeSingle();
        vaultSettings = data;
      }

      setMetrics({
        vaultBalanceUsd,
        openPositionValueUsd: openValue,
        openPositionsCount: stats.openPositions,
        avgLeverage: avgLev,
        totalPnl: stats.totalProfit,
        realizedPnl: stats.realizedProfit,
        unrealizedPnl: stats.unrealizedProfit,
        pnl24h: pnlInWindow(all, 24),
        pnl7d: pnlInWindow(all, 24 * 7),
        pnl30d: pnlInWindow(all, 24 * 30),
        winRate: stats.winRate,
        closedTradesCount: stats.closedTrades,
        autoTradeEnabled:
          vaultSettings != null
            ? Boolean(vaultSettings.auto_trade_enabled)
            : onChainAutoTrade,
        withdrawableUsd,
        isLoading: false,
      });
    } catch (e) {
      console.error('[useTradingDashboardMetrics]', e);
      setMetrics((m) => ({ ...m, isLoading: false }));
    }
  }, [address, isDemoUser, user?.id, publicClient, walletClient]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  return { metrics, refresh };
}
