import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth, DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { useWeb3 } from '../contexts/Web3Context';
import { useMonadierWallet } from './useMonadierWallet';
import { fetchUserWalletAddresses } from '../lib/userWallets';
import { resolveHlTradingWallet } from '../lib/hlTradingWallet';
import { fetchUserPositions } from '../lib/userPositions';
import { fetchHlUserFills } from '../lib/hyperliquid/user';
import { sumHlRealizedPnlFromFills, countHlClosedFills } from '../lib/hyperliquid/hlPnl';
import { normalizeHlPerpCoin } from '../lib/botTradingPairs';
import { isMeaningfulHlPosition } from '../lib/hyperliquid/format';
import {
  botFillTidSet,
  buildHlBotTradeWindows,
  filterFillsByScope,
  type HlBotMarkerRow,
} from '../lib/hyperliquid/splitHlActivity';
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
import { HL_BOT_HALTED } from '../lib/hyperliquid/hlBotHalt';

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
  const { address: monadierAddress } = useMonadierWallet();
  const { isDemoUser, user } = useAuth();
  const { publicClient, walletClient } = useWeb3();
  const [metrics, setMetrics] = useState<TradingDashboardMetrics>(defaultMetrics);
  const hasSnapshotRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const [linkedWallets, setLinkedWallets] = useState<string[]>([]);

  useEffect(() => {
    if (isDemoUser || !user) {
      setLinkedWallets([]);
      return;
    }
    let cancelled = false;
    void fetchUserWalletAddresses(monadierAddress, false).then((list) => {
      if (!cancelled) setLinkedWallets(list);
    });
    return () => {
      cancelled = true;
    };
  }, [monadierAddress, isDemoUser, user?.id]);

  const queryWallet = useMemo(() => {
    if (isDemoUser) return DEMO_WALLET_ADDRESS.toLowerCase() as `0x${string}`;
    // Fatal: never resolve HL wallet / history without HyperGain login.
    if (!user) return undefined;
    const connected = monadierAddress?.toLowerCase();
    const resolved = resolveHlTradingWallet({
      connectedAddress: connected,
      linkedWallets,
    });
    return resolved ? (resolved as `0x${string}`) : undefined;
  }, [isDemoUser, user, monadierAddress, linkedWallets]);

  const connectedAddress = user || isDemoUser ? monadierAddress ?? undefined : undefined;

  const hlWallet = queryWallet;
  const { snapshot: hlSnap } = useHlAccountSnapshot(hlWallet);
  const hlSnapRef = useRef(hlSnap);
  hlSnapRef.current = hlSnap;

  useEffect(() => {
    if (hlWallet) return;
    hasSnapshotRef.current = false;
    setMetrics(defaultMetrics);
  }, [hlWallet]);

  useEffect(() => {
    if (!hlSnap) return;
    hasSnapshotRef.current = true;
    setMetrics((prev) => ({
      ...prev,
      vaultBalanceUsd: hlSnap.totalUsd,
      withdrawableUsd: hlSnap.withdrawableUsd,
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
            connectedAddress,
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
      } else if (connectedAddress) {
        walletArray.push(connectedAddress.toLowerCase());
      }

      const primaryWallet = resolveHlTradingWallet({
        connectedAddress: connectedAddress,
        linkedWallets: walletArray,
      });
      let vaultSettings: { auto_trade_enabled?: boolean } | null = null;
      let agentApproved = false;
      let builderFeeApproved = true;
      let builderPlatformReady = true;

      let vaultBalanceUsd = hlSnapRef.current?.totalUsd ?? hlSnapRef.current?.accountUsd ?? 0;
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
          const [fills, markerRes] = await Promise.all([
            fetchHlUserFills(hlWalletForFills, 500),
            supabase
              .from('hl_bot_chart_markers')
              .select('coin, event_type, event_ts, source, fill_tid')
              .eq('wallet_address', hlWalletForFills.toLowerCase())
              .in('event_type', ['open', 'close'])
              .order('event_ts', { ascending: false })
              .limit(400),
          ]);
          const markerRows: HlBotMarkerRow[] = (markerRes.data ?? []).map((row) => ({
            coin: String(row.coin ?? ''),
            eventType: row.event_type as 'open' | 'close',
            eventMs: Date.parse(String(row.event_ts)) || 0,
            fillTid: row.fill_tid != null ? Number(row.fill_tid) : null,
            source: row.source != null ? String(row.source) : 'bot',
          }));
          const latest = new Map<string, { type: string; source: string }>();
          for (const row of markerRows) {
            const coin = normalizeHlPerpCoin(row.coin);
            if (!coin || latest.has(coin)) continue;
            latest.set(coin, { type: row.eventType, source: row.source ?? 'bot' });
          }
          const botOwned = new Set<string>();
          for (const [coin, row] of latest) {
            if (row.type === 'open' && row.source !== 'manual') botOwned.add(coin);
          }
          const windows = buildHlBotTradeWindows(markerRows);
          const tids = botFillTidSet(markerRows);
          const botFills = filterFillsByScope(fills, 'bot', windows, tids, markerRows);
          hlRealizedPnl = sumHlRealizedPnlFromFills(botFills);
          hlClosedFillCount = countHlClosedFills(botFills);

          const snapPos = hlSnapRef.current?.positions ?? [];
          const botPos = snapPos.filter(
            (p) =>
              isMeaningfulHlPosition(p.szi, p.entryPx) &&
              botOwned.has(normalizeHlPerpCoin(p.coin))
          );
          hlOpenCount = botPos.length;
          hlOpenNotional = botPos.reduce(
            (sum, p) => sum + Math.abs(Number.parseFloat(p.positionValue || '0') || 0),
            0
          );
          hlUnrealizedPnl = botPos.reduce(
            (sum, p) => sum + (Number.parseFloat(p.unrealizedPnl || '0') || 0),
            0
          );
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
      const autoTradeEnabled = HL_BOT_HALTED ? false : dbAutoTrade;

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
  }, [connectedAddress, isDemoUser, user?.id, publicClient, walletClient, queryWallet]);

  useEffect(() => {
    hasSnapshotRef.current = false;
  }, [connectedAddress, isDemoUser]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return { metrics, refresh };
}
