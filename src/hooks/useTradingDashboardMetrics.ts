import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { supabase } from '../lib/supabase';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { useWeb3 } from '../contexts/Web3Context';
import { pickPrimaryVaultWallet } from '../lib/userWallets';
import { fetchUserPositions } from '../lib/userPositions';
import { fetchHlAccountState } from '../lib/hyperliquid/user';
import {
  checkHlBotAgentApproved,
} from '../lib/hyperliquid/hlBotAgent';
import { fetchMaxBuilderFee, isBuilderApprovalSufficient } from '../lib/hyperliquid/builder';
import { getHlBuilderConfig } from '../lib/hyperliquid/builderConfig';
import { fetchHlBuilderPlatformStatus } from '../lib/hyperliquid/builderPlatform';
import {
  disableStaleHlBotAutoTrade,
  effectiveHlBotRunning,
  shouldDisableStaleHlBotAutoTrade,
} from '../lib/hlBotGates';
import {
  computePositionStats,
  fetchLiveTokenPrices,
  type PositionPnlRow,
} from '../lib/positionLivePnl';

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
    const queryWallet = (
      isDemoUser
        ? DEMO_WALLET_ADDRESS
        : address?.toLowerCase()
    ) as `0x${string}` | undefined;

    if (!isDemoUser && !user && !queryWallet) {
      setMetrics({ ...defaultMetrics, isLoading: false });
      return;
    }

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

      let vaultBalanceUsd = 0;
      let withdrawableUsd = 0;
      let hlOpenNotional = 0;
      let hlOpenCount = 0;
      let hlUnrealizedPnl = 0;
      let hlLoaded = false;
      let agentLoaded = false;

      const settingsWallet = (
        isDemoUser ? DEMO_WALLET_ADDRESS : (queryWallet ?? primaryWallet)
      ) as string | undefined;

      const hlWallet = (queryWallet ?? primaryWallet) as `0x${string}` | undefined;

      if (hlWallet) {
        try {
          const hl = await fetchHlAccountState(hlWallet);
          hlLoaded = true;
          vaultBalanceUsd = parseFloat(hl.margin.accountValue) || 0;
          withdrawableUsd = parseFloat(hl.withdrawable) || 0;
          hlOpenCount = hl.positions.length;
          hlOpenNotional = hl.positions.reduce(
            (sum, p) => sum + Math.abs(parseFloat(p.positionValue) || 0),
            0
          );
          hlUnrealizedPnl = hl.positions.reduce(
            (sum, p) => sum + (parseFloat(p.unrealizedPnl) || 0),
            0
          );
        } catch {
          /* HL read optional */
        }
      }

      if (hlWallet) {
        try {
          const agentCheck = await checkHlBotAgentApproved(hlWallet);
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
              const maxFee = await fetchMaxBuilderFee(hlWallet, builderConfig.address);
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
      let autoTradeEnabled = dbAutoTrade;
      if (
        dbAutoTrade &&
        hlWallet &&
        shouldDisableStaleHlBotAutoTrade(vaultBalanceUsd, agentApproved, {
          hlLoaded,
          agentLoaded,
          builderFeeApproved,
          builderPlatformReady,
        })
      ) {
        try {
          await disableStaleHlBotAutoTrade(hlWallet);
          autoTradeEnabled = false;
        } catch (e) {
          console.warn('[useTradingDashboardMetrics] stale auto_trade cleanup failed', e);
          autoTradeEnabled = false;
        }
      } else {
        autoTradeEnabled = effectiveHlBotRunning(
          dbAutoTrade,
          vaultBalanceUsd,
          agentApproved,
          builderFeeApproved,
          builderPlatformReady
        );
      }

      setMetrics({
        vaultBalanceUsd,
        withdrawableUsd,
        openPositionValueUsd: hlLoaded ? hlOpenNotional : 0,
        openPositionsCount: hlLoaded ? hlOpenCount : 0,
        avgLeverage: hlOpenCount > 0 ? avgLev : 1,
        totalPnl: hlLoaded
          ? stats.realizedProfit + hlUnrealizedPnl
          : stats.totalProfit,
        realizedPnl: stats.realizedProfit,
        unrealizedPnl: hlLoaded ? hlUnrealizedPnl : stats.unrealizedProfit,
        pnl24h: pnlInWindow(all, 24),
        pnl7d: pnlInWindow(all, 24 * 7),
        pnl30d: pnlInWindow(all, 24 * 30),
        winRate: stats.winRate,
        closedTradesCount: stats.closedTrades,
        autoTradeEnabled,
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
