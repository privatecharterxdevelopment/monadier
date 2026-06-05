import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { useWeb3 } from '../contexts/Web3Context';
import { MONADIER_VAULT_V11_ADDRESS } from '../lib/monadierVault';
import { useTradingDashboardMetrics } from './useTradingDashboardMetrics';

const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

export type Dashboard2Metrics = {
  walletAvailableUsd: number;
  vaultUsd: number;
  activeTradeUsd: number;
  totalPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  withdrawnUsd: number;
  openPositionsCount: number;
  autoTradeEnabled: boolean;
  winRate: number;
  closedTradesCount: number;
  isLoading: boolean;
};

const defaultState: Dashboard2Metrics = {
  walletAvailableUsd: 0,
  vaultUsd: 0,
  activeTradeUsd: 0,
  totalPnlUsd: 0,
  realizedPnlUsd: 0,
  unrealizedPnlUsd: 0,
  withdrawnUsd: 0,
  openPositionsCount: 0,
  autoTradeEnabled: false,
  winRate: 0,
  closedTradesCount: 0,
  isLoading: true,
};

async function fetchWithdrawnTotalUsd(wallet: string): Promise<number> {
  try {
    const params = new URLSearchParams({
      module: 'account',
      action: 'tokentx',
      contractaddress: USDC_ARBITRUM,
      address: wallet,
      sort: 'desc',
      page: '1',
      offset: '250',
    });
    const res = await fetch(`https://api.arbiscan.io/api?${params}`);
    const data = await res.json();
    if (data.status !== '1' || !Array.isArray(data.result)) return 0;

    const vault = MONADIER_VAULT_V11_ADDRESS.toLowerCase();
    const user = wallet.toLowerCase();

    return data.result.reduce((sum: number, tx: { from: string; to: string; value: string }) => {
      if (tx.from?.toLowerCase() === vault && tx.to?.toLowerCase() === user) {
        return sum + Number(tx.value) / 1e6;
      }
      return sum;
    }, 0);
  } catch (e) {
    console.warn('[useDashboard2Metrics] withdrawn fetch failed', e);
    return 0;
  }
}

export function useDashboard2Metrics() {
  const { totalUsdValue, isLoadingBalances, refreshBalances } = useWeb3();
  const { address } = useAccount();
  const { isDemoUser } = useAuth();
  const { metrics, refresh: refreshTrading } = useTradingDashboardMetrics();
  const [withdrawnUsd, setWithdrawnUsd] = useState(0);
  const [withdrawnLoading, setWithdrawnLoading] = useState(false);

  const queryWallet = isDemoUser
    ? DEMO_WALLET_ADDRESS
    : address?.toLowerCase();

  const refreshWithdrawn = useCallback(async () => {
    if (!queryWallet) {
      setWithdrawnUsd(0);
      return;
    }
    setWithdrawnLoading(true);
    const total = await fetchWithdrawnTotalUsd(queryWallet);
    setWithdrawnUsd(total);
    setWithdrawnLoading(false);
  }, [queryWallet]);

  useEffect(() => {
    refreshWithdrawn();
  }, [refreshWithdrawn]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshBalances(), refreshTrading(), refreshWithdrawn()]);
  }, [refreshBalances, refreshTrading, refreshWithdrawn]);

  const isLoading =
    metrics.isLoading || isLoadingBalances || withdrawnLoading;

  const combined: Dashboard2Metrics = {
    walletAvailableUsd: totalUsdValue,
    vaultUsd: metrics.vaultBalanceUsd,
    activeTradeUsd: metrics.openPositionValueUsd,
    totalPnlUsd: metrics.totalPnl,
    realizedPnlUsd: metrics.realizedPnl,
    unrealizedPnlUsd: metrics.unrealizedPnl,
    withdrawnUsd,
    openPositionsCount: metrics.openPositionsCount,
    autoTradeEnabled: metrics.autoTradeEnabled,
    winRate: metrics.winRate,
    closedTradesCount: metrics.closedTradesCount,
    isLoading,
  };

  return { metrics: combined, refresh, tradingMetrics: metrics };
}
