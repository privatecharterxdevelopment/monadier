import { useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useTradingDashboardMetrics } from './useTradingDashboardMetrics';

export type Dashboard2Metrics = {
  walletAvailableUsd: number;
  /** Hyperliquid account value — bot trading capital */
  hlBalanceUsd: number;
  /** @deprecated use hlBalanceUsd */
  vaultUsd: number;
  hlWithdrawableUsd: number;
  activeTradeUsd: number;
  totalPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  /** @deprecated HL-only — always 0 (no Arbitrum vault withdrawals). */
  withdrawnUsd: number;
  openPositionsCount: number;
  autoTradeEnabled: boolean;
  winRate: number;
  closedTradesCount: number;
  isLoading: boolean;
  hasHlSnapshot: boolean;
};

const defaultState: Dashboard2Metrics = {
  walletAvailableUsd: 0,
  hlBalanceUsd: 0,
  vaultUsd: 0,
  hlWithdrawableUsd: 0,
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
  hasHlSnapshot: false,
};

export function useDashboard2Metrics() {
  const { totalUsdValue, refreshBalances } = useWeb3();
  const { metrics, refresh: refreshTrading } = useTradingDashboardMetrics();

  const refresh = useCallback(async () => {
    await Promise.all([refreshBalances(), refreshTrading()]);
  }, [refreshBalances, refreshTrading]);

  const isLoading = metrics.isLoading && !metrics.hasHlSnapshot;

  const combined: Dashboard2Metrics = {
    walletAvailableUsd: totalUsdValue,
    hlBalanceUsd: metrics.vaultBalanceUsd,
    vaultUsd: metrics.vaultBalanceUsd,
    hlWithdrawableUsd: metrics.withdrawableUsd,
    activeTradeUsd: metrics.openPositionValueUsd,
    totalPnlUsd: metrics.totalPnl,
    realizedPnlUsd: metrics.realizedPnl,
    unrealizedPnlUsd: metrics.unrealizedPnl,
    withdrawnUsd: 0,
    openPositionsCount: metrics.openPositionsCount,
    autoTradeEnabled: metrics.autoTradeEnabled,
    winRate: metrics.winRate,
    closedTradesCount: metrics.closedTradesCount,
    isLoading,
    hasHlSnapshot: metrics.hasHlSnapshot,
  };

  return { metrics: combined, refresh, tradingMetrics: metrics };
}
