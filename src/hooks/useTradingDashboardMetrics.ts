import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { supabase } from '../lib/supabase';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { useWeb3 } from '../contexts/Web3Context';
import { pickPrimaryVaultWallet } from '../lib/userWallets';
import { fetchUserPositions } from '../lib/userPositions';
import { fetchHlUserFills } from '../lib/hyperliquid/user';
import { sumHlRealizedPnlFromFills, countHlClosedFills } from '../lib/hyperliquid/hlPnl';
import {
  checkHlBotAgentApproved,
} from '../lib/hyperliquid/hlBotAgent';
import { fetchMaxBuilderFee, isBuilderApprovalSufficient } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';
import { fetchHlBuilderPlatformStatus } from '../lib/hyperliquid/builderPlatform';
import {
  computePositionStats,
  fetchLiveTokenPrices,
  type PositionPnlRow,
} from '../lib/positionLivePnl';
import { useHlAccountSnapshot } from './useHlAccountSnapshot';

export type TradingDashboardMetrics = {
  /** Hyperliquid account value — primary bot trading capital */
  vaultBalanceUsd: number;
  /** HL withdrawable USDC */
  withdrawableUsd: number;
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
  isLoading: boolean;
  /** False until the first HL snapshot arrives — footer may show placeholders once. */
  hasHlSnapshot: boolean;
};

const HL_BOT_CHAIN_ID = 42161;

const defaultMetrics: TradingDashboardMetrics = {
  vaultBalanceUsd: 0,
  withdrawableUsd: 0,
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
  closedTradesCount: 0,
  autoTradeEnabled: false,
  isLoading: true,
  hasHlSnapshot: false,
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
  const hasSnapshotRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const queryWallet = (
    isDemoUser ? DEMO_WALLET_ADDRESS : address?.toLowerCase()
  ) as `0x${string}` | undefined;

  const hlWallet = queryWallet;
  const { snapshot: hlSnap } = useHlAccountSnapshot(hlWallet);
  const hlSnapRef = useRef(hlSnap);
  hlSnapRef.current = hlSnap;

  useEffect(() => {
    if (!hlSnap) return;
    hasSnapshotRef.current = true;
    setMetrics((prev) => ({
      ...prev,
      vaultBalanceUsd: hlSnap.accountUsd,
      withdrawableUsd: hlSnap.withdrawableUsd,
      openPositionValueUsd: hlSnap.openNotionalUsd,
      openPositionsCount: hlSnap.openPositionsCount,
      unrealizedPnl: hlSnap.unrealizedPnlUsd,
      hasHlSnapshot: true,
      isLoading: false,
    }));
  }, [hlSnap]);

  const refresh = useCallback(async () => {

    if (!isDemoUser && !user && !queryWallet) {
      refreshInFlightRef.current = false;
      return;
    }

    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      let all: Awaited<ReturnType<typeof fetchUserPositions>> = [];
      let livePrices: Awaited<ReturnType<typeof fetchLiveTokenPrices>> = {};

      if (isDemoUser || user) {
        [all, livePrices] = await Promise.all([
          fetchUserPositions({
            isDemoUser,
            connectedAddress: address,
            userId: user?.id,
          }),
          fetchLiveTokenPrices(),
        ]);
      }

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
      let agentApproved = false;
      let builderFeeApproved = true;
      let builderPlatformReady = true;

      let vaultBalanceUsd = hlSnapRef.current?.accountUsd ?? 0;
      let withdrawableUsd = hlSnapRef.current?.withdrawableUsd ?? 0;
      let hlOpenNotional = hlSnapRef.current?.openNotionalUsd ?? 0;
      let hlOpenCount = hlSnapRef.current?.openPositionsCount ?? 0;
      let hlUnrealizedPnl = hlSnapRef.current?.unrealizedPnlUsd ?? 0;
      let hlRealizedPnl = 0;
      let hlClosedFillCount = 0;
      const hlLoaded = hlSnapRef.current != null;
      let agentLoaded = false;

      const settingsWallet = (
        isDemoUser ? DEMO_WALLET_ADDRESS : (queryWallet ?? primaryWallet)
      ) as string | undefined;

      const hlWalletForFills = (queryWallet ?? primaryWallet) as `0x${string}` | undefined;

      if (hlWalletForFills) {
        try {
          const fills = await fetchHlUserFills(hlWalletForFills, 500);
          hlRealizedPnl = sumHlRealizedPnlFromFills(fills);
          hlClosedFillCount = countHlClosedFills(fills);
        } catch {
          /* fills optional */
        }
      }

      if (hlWalletForFills) {
        try {
          const agentCheck = await checkHlBotAgentApproved(hlWalletForFills);
          agentApproved = agentCheck.approved;
          agentLoaded = agentCheck.loaded;
        } catch {
          agentApproved = false;
        }
        try {
          const builderConfig = getHlBuilderConfig();
          if (builderConfig.enabled) {
            const platform = await fetchHlBuilderPlatformStatus();
            builderPlatformReady = platform.ready;
            if (platform.ready) {
              const maxFee = await fetchMaxBuilderFee(hlWalletForFills, builderConfig.address);
              builderFeeApproved = isBuilderApprovalSufficient(maxFee);
            } else {
              builderFeeApproved = true;
            }
          }
        } catch {
          builderFeeApproved = false;
        }
      }

      if (settingsWallet) {
        const { data } = await supabase
          .from('vault_settings')
          .select('auto_trade_enabled')
          .eq('wallet_address', settingsWallet)
          .eq('chain_id', HL_BOT_CHAIN_ID)
          .maybeSingle();
        vaultSettings = data;
      }

      const dbAutoTrade = vaultSettings != null ? Boolean(vaultSettings.auto_trade_enabled) : false;
      const autoTradeEnabled = dbAutoTrade;

      if (hlLoaded) {
        hasSnapshotRef.current = true;
      }

      setMetrics((prev) => ({
        vaultBalanceUsd: hlLoaded ? vaultBalanceUsd : prev.vaultBalanceUsd,
        withdrawableUsd: hlLoaded ? withdrawableUsd : prev.withdrawableUsd,
        openPositionValueUsd: hlLoaded ? hlOpenNotional : prev.openPositionValueUsd,
        openPositionsCount: hlLoaded ? hlOpenCount : prev.openPositionsCount,
        avgLeverage: hlOpenCount > 0 ? avgLev : prev.avgLeverage,
        totalPnl: hlLoaded ? hlRealizedPnl + hlUnrealizedPnl : prev.totalPnl,
        realizedPnl: hlLoaded ? hlRealizedPnl : prev.realizedPnl,
        unrealizedPnl: hlLoaded ? hlUnrealizedPnl : prev.unrealizedPnl,
        pnl24h: pnlInWindow(all, 24),
        pnl7d: pnlInWindow(all, 24 * 7),
        pnl30d: pnlInWindow(all, 24 * 30),
        winRate: stats.winRate,
        closedTradesCount: hlLoaded
          ? Math.max(stats.closedTrades, hlClosedFillCount)
          : stats.closedTrades,
        autoTradeEnabled,
        isLoading: false,
        hasHlSnapshot: hasSnapshotRef.current,
      }));
    } catch (e) {
      console.error('[useTradingDashboardMetrics]', e);
      setMetrics((m) => ({ ...m, isLoading: false }));
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [address, isDemoUser, user?.id, publicClient, walletClient, queryWallet]);

  useEffect(() => {
    hasSnapshotRef.current = false;
  }, [address, isDemoUser]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return { metrics, refresh };
}
