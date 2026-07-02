import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useHlActiveWallet } from '../../hooks/useHlActiveWallet';
import ProTradeShell from '../../components/protrade/ProTradeShell';
import MonadierWalletAccountSheet from '../../components/wallet/MonadierWalletAccountSheet';
import ProTradeTopNav, { type ProTradeSection } from '../../components/protrade/ProTradeTopNav';
import ProTradeMobileTradeFab from '../../components/protrade/ProTradeMobileTradeFab';
import ProTradeProfile from '../../components/protrade/ProTradeProfile';
import {
  ProTradeBotDockSlot,
  ProTradeBotPanelSlot,
  ProTradeBotProvider,
  ProTradeBotStatusBar,
} from '../../components/protrade/ProTradeBotSide';
import ProTradeBotAnalysis from '../../components/protrade/ProTradeBotAnalysis';
import type { HlBotDockTab } from '../../components/protrade/ProTradeHlBotDock';
import ProTradeTickerStrip from '../../components/protrade/ProTradeTickerStrip';
import ProTradeMarketBar from '../../components/protrade/ProTradeMarketBar';
import ProTradeChart from '../../components/protrade/ProTradeChart';
import ProTradeOrderBook from '../../components/protrade/ProTradeOrderBook';
import ProTradeOrderPanel from '../../components/protrade/ProTradeOrderPanel';
import ProTradeDock, { type ProTradeDockTab } from '../../components/protrade/ProTradeDock';
import ProTradeStatusBar from '../../components/protrade/ProTradeStatusBar';
import ProTradeDepositModal from '../../components/protrade/ProTradeDepositModal';
import ProTradeTransferModal from '../../components/protrade/ProTradeTransferModal';
import ProTradePortfolio from '../../components/protrade/ProTradePortfolio';
import ProTradeSupport from '../../components/protrade/ProTradeSupport';
import ProTradeSportsbets from '../../components/protrade/ProTradeSportsbets';
import ProTradeNews from '../../components/protrade/ProTradeNews';
import ProTradeAffiliate from '../../components/protrade/ProTradeAffiliate';
import ProTradeLeaderboard from '../../components/protrade/ProTradeLeaderboard';
import { BettingUiProvider, useBettingUi } from '../../contexts/BettingUiContext';
import { LegalAcceptanceProvider } from '../../contexts/LegalAcceptanceContext';
import { useProTradeTheme } from '../../contexts/ProTradeThemeContext';
import type { ProTradeProfileTab } from '../../components/protrade/proTradeProfileTypes';
import type { ActivityNotification } from '../../lib/activityNotifications';
import { useHyperliquidMarket } from '../../hooks/useHyperliquidMarket';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHlBotChartOverlay } from '../../hooks/useHlBotChartOverlay';
import { useHlBotManagedCoins } from '../../hooks/useHlBotManagedCoins';
import { useHlAccountSnapshot } from '../../hooks/useHlAccountSnapshot';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { setLastKnownHlBotAutoTrade } from '../../lib/hlBotRunningStore';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { useHyperliquidMarkets } from '../../hooks/useHyperliquidMarkets';
import { useHyperliquidMarkPrices } from '../../hooks/useHyperliquidMarkPrices';
import { useHyperliquidSpotPrices } from '../../hooks/useHyperliquidSpotPrices';
import {
  DEFAULT_PRO_COIN,
  DEFAULT_PRO_INTERVAL,
} from '../../lib/hyperliquid/constants';
import type { HlInterval } from '../../lib/hyperliquid/types';
import type { HlPosition } from '../../lib/hyperliquid/user';
import { isHlSpotCoin } from '../../lib/hyperliquid/spot';
import { readNum, toNum } from '../../lib/hyperliquid/parse';
import { hlCoinToBotSymbol, normalizeHlPerpCoin } from '../../lib/botTradingPairs';
import { filterHlPositions } from '../../lib/hyperliquid/splitHlPositions';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { useBotServerBlockers } from '../../hooks/useBotServerBlockers';
import { useBotPositionBadge } from '../../hooks/useBotPositionBadge';
import { useAuth } from '../../contexts/AuthContext';
import ProTradeSignInModal from '../../components/protrade/ProTradeSignInModal';
import ProTradeRegisterModal from '../../components/protrade/ProTradeRegisterModal';
import { useHlBotChartMarkers } from '../../hooks/useHlBotChartMarkers';
import { useHlBotMinBalanceGuard } from '../../hooks/useHlBotMinBalanceGuard';
import { getProTradeChartColors } from '../../lib/proTradeTheme';
import { PlatformFeeProvider } from '../../contexts/PlatformFeeContext';

const PROFILE_TABS = new Set<ProTradeProfileTab>([
  'identity',
  'security',
  'wallets',
  'betting',
  'botTrades',
  'history',
]);

function parseProfileTab(raw: string | null): ProTradeProfileTab {
  if (raw && PROFILE_TABS.has(raw as ProTradeProfileTab)) {
    return raw as ProTradeProfileTab;
  }
  return 'identity';
}

const Dashboard2ProPageContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, sessionReady } = useAuth();
  const { address, isConnected } = useMonadierWallet();
  const { wallet: hlActiveWallet, walletMismatch } = useHlActiveWallet();
  const initialSection = searchParams.get('section');
  const [section, setSection] = useState<ProTradeSection>(() => {
    if (initialSection === 'bot') return 'bot';
    if (initialSection === 'news') return 'news';
    if (initialSection === 'leaderboard') return 'leaderboard';
    if (initialSection === 'sportsbets' || initialSection === 'spot') return 'sportsbets';
    return 'perps';
  });
  const [perpCoin, setPerpCoin] = useState(DEFAULT_PRO_COIN);
  const [interval, setInterval] = useState<HlInterval>(DEFAULT_PRO_INTERVAL);
  const [limitPrice, setLimitPrice] = useState('');
  const [fundsModal, setFundsModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [perpDockTab, setPerpDockTab] = useState<ProTradeDockTab>('positions');
  const [botDockTab, setBotDockTab] = useState<HlBotDockTab>('positions');
  const [toast, setToast] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<'signin' | 'register' | null>(null);
  const [signInReason, setSignInReason] = useState<string | undefined>();
  const [botSyncTick, setBotSyncTick] = useState(0);
  const [profileTab, setProfileTab] = useState<ProTradeProfileTab>(() =>
    parseProfileTab(searchParams.get('tab'))
  );
  const { badge: botBadge } = useBotPositionBadge(botSyncTick);
  const { theme } = useProTradeTheme();
  const chartMarkerColors = useMemo(() => getProTradeChartColors(theme), [theme]);

  const { registerOpenFunds } = useBettingUi();

  useEffect(() => {
    registerOpenFunds((tab) => setFundsModal(tab));
    return () => registerOpenFunds(null);
  }, [registerOpenFunds]);

  const { markets: perpMarkets, loading: perpMarketsLoading, refresh: refreshPerpMarkets } =
    useHyperliquidMarkets();

  const perpMarket = useHyperliquidMarket(perpCoin, interval, 'perp', {
    enabled: section === 'perps' || section === 'bot',
  });

  const {
    account,
    spotBalances,
    openOrders,
    fills,
    funding,
    orderHistory,
    twapOrders,
    loading: accountLoading,
    refresh: refreshAccount,
  } = useHyperliquidAccount(hlActiveWallet ?? address);
  const { cancelOrder, cancelAllOrders, cancelTwapOrder, closePosition, busy: tradeBusy } =
    useHyperliquidTrading();

  const perpOpenOrders = useMemo(
    () => openOrders.filter((o) => !isHlSpotCoin(o.coin)),
    [openOrders]
  );
  const perpFills = useMemo(
    () => fills.filter((f) => !isHlSpotCoin(f.coin)),
    [fills]
  );

  const { coins: botManagedCoins, refresh: refreshBotManagedCoins } = useHlBotManagedCoins(
    (hlActiveWallet ?? address)?.toLowerCase(),
    botSyncTick + perpFills.length
  );

  const botPositions = useMemo(
    () => filterHlPositions(account?.positions, botManagedCoins, 'bot'),
    [account?.positions, botManagedCoins]
  );

  const manualPositions = useMemo(
    () => filterHlPositions(account?.positions, botManagedCoins, 'manual'),
    [account?.positions, botManagedCoins]
  );

  const botChartCoin = section === 'bot' ? perpCoin : undefined;
  const { seriesMarkers: botTradeMarkers } = useHlBotChartMarkers(
    hlActiveWallet ?? address,
    botChartCoin,
    chartMarkerColors,
    botSyncTick + perpFills.length
  );
  const positionCoins = useMemo(
    () => (account?.positions ?? []).map((p) => p.coin),
    [account?.positions]
  );
  const { prices: positionMarkPrices } = useHyperliquidMarkPrices(positionCoins, 5000);
  const spotTokens = useMemo(() => spotBalances.map((b) => b.coin), [spotBalances]);
  const { prices: spotTokenPrices } = useHyperliquidSpotPrices(spotTokens);

  const perpAccountValue = readNum(account, ['margin', 'accountValue']);
  const spotUsdc = useMemo(
    () => toNum(spotBalances.find((b) => b.coin === 'USDC')?.total),
    [spotBalances]
  );
  const { snapshot: perpHlSnapshot, refresh: refreshHlSnapshot } = useHlAccountSnapshot(
    (hlActiveWallet ?? address)?.toLowerCase()
  );
  const perpWithdrawable = toNum(account?.withdrawable);
  const hlTotalUsd = perpHlSnapshot?.totalUsd ?? perpHlSnapshot?.tradablePerpUsd ?? 0;
  const hlWithdrawable = perpHlSnapshot?.withdrawableUsd ?? perpWithdrawable;
  const perpTradableUsd =
    perpHlSnapshot?.tradablePerpUsd ??
    (perpAccountValue > 0 ? perpAccountValue : Math.max(perpAccountValue, spotUsdc));

  const perpMarkPx = toNum(perpMarket.snapshot?.markPx);
  const chartMarkPx =
    perpMarket.loading && perpMarket.candles.length === 0 ? undefined : perpMarkPx;

  const activePerpTwap = useMemo(
    () =>
      twapOrders.find(
        (t) => t.status === 'activated' && t.coin === perpCoin && !isHlSpotCoin(t.coin)
      ) ?? null,
    [twapOrders, perpCoin]
  );

  const totalUpnl = useMemo(
    () => manualPositions.reduce((s, p) => s + toNum(p.unrealizedPnl), 0),
    [manualPositions]
  );

  const botOpenPosition = useMemo(() => botPositions[0] ?? null, [botPositions]);

  /** Open HL position on the chart's active coin (not always the first in the list). */
  const botChartPosition = useMemo(
    () =>
      botPositions.find(
        (p) => normalizeHlPerpCoin(p.coin) === normalizeHlPerpCoin(perpCoin)
      ) ?? null,
    [botPositions, perpCoin]
  );

  const botOpenPositionCount = botPositions.length;

  const botOpenPositionCoins = useMemo(
    () => botPositions.map((p) => p.coin),
    [botPositions]
  );

  const { settings: botVaultSettings, wallet: botTradingWallet, reload: reloadBotSettings, isLoading: botSettingsLoading } =
    useTerminalBotSettings(botSyncTick);

  useEffect(() => {
    if (botSettingsLoading) return;
    setLastKnownHlBotAutoTrade(botVaultSettings.autoTradeEnabled);
  }, [botVaultSettings.autoTradeEnabled, botSettingsLoading]);
  const { snapshot: botHlSnapshot } = useHlAccountSnapshot(
    (botTradingWallet ?? address)?.toLowerCase() ?? undefined
  );
  const botTradableHlUsd = botHlSnapshot?.tradablePerpUsd ?? perpAccountValue;
  const botServerStatus = useBotServerBlockers(
    (botTradingWallet ?? address)?.toLowerCase(),
    section === 'bot' && botVaultSettings.autoTradeEnabled
  );
  const botScanCoin = useMemo(() => {
    if (botOpenPositionCount >= HL_MAX_CONCURRENT_POSITIONS) {
      return botOpenPosition?.coin ?? perpCoin;
    }
    const next = botServerStatus.nextSetup?.coin?.toUpperCase();
    if (botOpenPositionCount > 0 && next) return next;
    return perpCoin;
  }, [
    botOpenPositionCount,
    botOpenPosition?.coin,
    botServerStatus.nextSetup?.coin,
    perpCoin,
  ]);

  const botEffSettings = useMemo(
    () => effectiveHlBotSettings(botVaultSettings),
    [botVaultSettings]
  );

  const botChartOverlay = useHlBotChartOverlay(
    botChartPosition,
    perpCoin,
    botVaultSettings.hlBotStrategy,
    {
      stopLossMarginPct: botEffSettings.stopLoss,
      takeProfitMarginPct: botEffSettings.takeProfit,
    }
  );

  /** User picked a position coin — don't auto-switch chart away from it. */
  const pinnedChartCoinRef = useRef<string | null>(null);

  const selectChartCoin = useCallback((coin: string) => {
    const next = normalizeHlPerpCoin(coin);
    if (!next) return;
    pinnedChartCoinRef.current = next;
    setPerpCoin(next);
    requestAnimationFrame(() => {
      document.querySelector('.hl-chart-row')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }, []);

  const prevSectionRef = useRef(section);
  useEffect(() => {
    if (section !== 'bot') {
      pinnedChartCoinRef.current = null;
    }
  }, [section]);

  useEffect(() => {
    const prev = prevSectionRef.current;
    prevSectionRef.current = section;
    if (prev === 'bot' || section !== 'bot') return;
    if (botOpenPositionCoins.length === 0) return;
    const pinned = pinnedChartCoinRef.current;
    if (pinned && botOpenPositionCoins.some((c) => normalizeHlPerpCoin(c) === pinned)) {
      setPerpCoin(pinned);
      return;
    }
    setPerpCoin((current) => {
      const norm = normalizeHlPerpCoin(current);
      return botOpenPositionCoins.some((c) => normalizeHlPerpCoin(c) === norm)
        ? norm
        : normalizeHlPerpCoin(botOpenPositionCoins[0]);
    });
  }, [section, botOpenPositionCoins]);

  const perpMarkPrices = useMemo(() => {
    const map = { ...positionMarkPrices };
    if (perpMarkPx > 0) map[perpCoin] = perpMarkPx;
    return map;
  }, [positionMarkPrices, perpCoin, perpMarkPx]);

  useEffect(() => {
    const norm = normalizeHlPerpCoin(perpCoin);
    if (!norm || norm === perpCoin) return;
    setPerpCoin(norm);
  }, [perpCoin]);

  useEffect(() => {
    if (perpMarkets.length === 0) return;
    const norm = normalizeHlPerpCoin(perpCoin);
    const valid = new Set(perpMarkets.map((m) => normalizeHlPerpCoin(m.name)));
    if (valid.has(norm)) return;
    const openMatch = manualPositions.find((p) => normalizeHlPerpCoin(p.coin) === norm);
    if (openMatch) return;
    setPerpCoin(DEFAULT_PRO_COIN);
  }, [perpMarkets, perpCoin, manualPositions]);

  const closeAuthModal = useCallback(() => {
    setAuthModal(null);
    setSignInReason(undefined);
  }, []);

  useEffect(() => {
    const onCloseOverlays = () => {
      setAuthModal(null);
      setSignInReason(undefined);
      setFundsModal(null);
    };
    window.addEventListener('monadier:close-overlays', onCloseOverlays);
    return () => window.removeEventListener('monadier:close-overlays', onCloseOverlays);
  }, []);

  const promptSignIn = useCallback((reason: string) => {
    setSignInReason(reason);
    setAuthModal('signin');
  }, []);

  const switchToRegister = useCallback(() => {
    setSignInReason(undefined);
    setAuthModal('register');
  }, []);

  const switchToSignIn = useCallback(() => {
    setAuthModal('signin');
  }, []);

  useEffect(() => {
    if (!authModal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [authModal]);

  const requireAuth = (reason: string): boolean => {
    if (user) return true;
    promptSignIn(reason);
    return false;
  };

  const openProfile = (tab: ProTradeProfileTab = 'identity') => {
    if (!requireAuth('Sign in to open profile and vault settings.')) return;
    setProfileTab(tab);
    setSection('profile');
    setFundsModal(null);
    const params = new URLSearchParams(searchParams);
    params.set('section', 'profile');
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  };

  const handleProfileTabChange = (tab: ProTradeProfileTab) => {
    setProfileTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('section', 'profile');
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  };

  const handleSectionChange = (next: ProTradeSection) => {
    if (next === 'profile') {
      openProfile(profileTab);
      return;
    }
    if (next === 'affiliate') {
      if (!requireAuth('Sign in to view your affiliate dashboard.')) return;
    }
    setSection(next);
    setFundsModal(null);
    if (next === 'bot') {
      setBotDockTab('positions');
    }
    if (
      next === 'bot' ||
      next === 'sportsbets' ||
      next === 'support' ||
      next === 'news' ||
      next === 'leaderboard' ||
      next === 'affiliate'
    ) {
      const params = new URLSearchParams(searchParams);
      params.set('section', next);
      params.delete('tab');
      setSearchParams(params, { replace: true });
    } else {
      const params = new URLSearchParams(searchParams);
      params.delete('section');
      params.delete('tab');
      setSearchParams(params, { replace: true });
    }
  };

  useEffect(() => {
    if (!sessionReady) return;
    const urlSection = searchParams.get('section');
    const urlTab = parseProfileTab(searchParams.get('tab'));
    if (!user) {
      if (urlSection === 'profile') {
        setProfileTab(parseProfileTab(searchParams.get('tab')));
      } else if (urlSection === 'history') {
        setProfileTab('botTrades');
      } else if (urlSection === 'sportsbets' || urlSection === 'spot') {
        setSection('sportsbets');
      } else if (urlSection === 'support') {
        setSection('support');
      } else if (urlSection === 'news') {
        setSection('news');
      } else if (urlSection === 'leaderboard') {
        setSection('leaderboard');
      } else if (urlSection === 'affiliate') {
        setSection('affiliate');
      } else if (urlSection === 'swap') {
        setSection('perps');
      }
      return;
    }
    if (urlSection === 'profile') {
      setProfileTab(urlTab);
      setSection('profile');
    } else if (urlSection === 'history') {
      setProfileTab('botTrades');
      setSection('profile');
    } else if (urlSection === 'bot') {
      setSection('bot');
    } else if (urlSection === 'sportsbets' || urlSection === 'spot') {
      setSection('sportsbets');
    } else if (urlSection === 'support') {
      setSection('support');
    } else if (urlSection === 'news') {
      setSection('news');
    } else if (urlSection === 'leaderboard') {
      setSection('leaderboard');
    } else if (urlSection === 'affiliate') {
      setSection('affiliate');
    } else if (urlSection === 'swap') {
      setSection('perps');
    }
  }, [searchParams, sessionReady, user]);

  useEffect(() => {
    if (!sessionReady || user) return;
    if (section !== 'profile') return;

    setSection('perps');
    const params = new URLSearchParams(searchParams);
    params.delete('section');
    params.delete('tab');
    setSearchParams(params, { replace: true });
  }, [sessionReady, user, section, searchParams, setSearchParams]);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash || section !== 'profile') return;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [section]);

  const handleRefreshAll = async () => {
    await Promise.all([
      perpMarket.refresh(),
      refreshAccount(),
      refreshPerpMarkets(),
      refreshHlSnapshot(),
      refreshBotManagedCoins(),
    ]);
  };

  const openSupport = () => {
    handleSectionChange('support');
  };

  const openAffiliate = () => {
    handleSectionChange('affiliate');
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const onBotMinBalanceStopped = useCallback(() => {
    showToast('Low HL balance — deposit $20+ USDC on Hyperliquid or new trades may be skipped');
  }, [showToast]);

  useHlBotMinBalanceGuard({
    wallet: botTradingWallet ?? address,
    hlBalanceUsd: botTradableHlUsd,
    spotUsdcUsd: spotUsdc,
    autoTradeEnabled: botVaultSettings.autoTradeEnabled,
    enabled: section === 'bot' && Boolean(botTradingWallet ?? address),
    onStopped: onBotMinBalanceStopped,
  });

  const handleClosePosition = async (position: HlPosition) => {
    const size = Math.abs(toNum(position.szi));
    const isLong = toNum(position.szi) >= 0;
    const px = perpMarkPrices[position.coin] ?? perpMarkPx;
    if (size <= 0 || px <= 0) return;
    const profitUsd = Math.max(0, toNum(position.unrealizedPnl));
    await closePosition({ coin: position.coin, size, isLong, markPx: px, profitUsd });
    await handleRefreshAll();
  };

  const openBotHistory = (_tradeId?: string) => {
    if (!requireAuth('Sign in to view bot trade notifications and history.')) return;
    openProfile('botTrades');
  };

  const openBettingHistory = () => {
    if (!requireAuth('Sign in to view your betting history.')) return;
    setProfileTab('betting');
    handleSectionChange('profile');
  };

  const openNotificationHistory = (notification?: ActivityNotification) => {
    if (!notification) {
      openBotHistory();
      return;
    }
    if (notification.kind === 'betting') {
      openBettingHistory();
      return;
    }
    openBotHistory(notification.highlightId ?? undefined);
  };

  const renderPerpTerminal = () => (
    <div className="hl-terminal">
      <ProTradeTickerStrip markets={perpMarkets} coin={perpCoin} onCoinChange={setPerpCoin} />
      <ProTradeMarketBar
        coin={perpCoin}
        markets={perpMarkets}
        marketsLoading={perpMarketsLoading}
        snapshot={perpMarket.snapshot}
        loading={perpMarket.loading}
        onCoinChange={setPerpCoin}
        variant="perp"
      />

      {perpMarket.error ? (
        <div style={{ padding: '8px 12px', color: '#ef5350', fontSize: 12 }} role="alert">
          {perpMarket.error}
        </div>
      ) : null}

      <div className="hl-body">
        <div className="hl-workspace-main">
          <div className="hl-chart-row">
            <ProTradeChart
              coin={perpCoin}
              interval={interval}
              candles={perpMarket.candles}
              loading={perpMarket.loading}
              openOrders={perpOpenOrders}
              onIntervalChange={setInterval}
              layoutKey={`perps-${perpCoin}`}
              markPx={chartMarkPx}
              onChartRetry={() => void perpMarket.refresh()}
              wsConnected={perpMarket.wsConnected}
              chartError={perpMarket.error}
              fetchAttempts={perpMarket.fetchAttempts}
            />
            <ProTradeOrderBook
              book={perpMarket.book}
              recentTrades={perpMarket.recentTrades}
              markPx={perpMarkPx}
              coin={perpCoin}
              onPriceClick={(px) => setLimitPrice(String(px))}
            />
          </div>
              <div className="hl-dock hl-hl-dock">
                <div className="hl-dock-mode-label">Hyperliquid · Perps account</div>
                <ProTradeDock
                  account={account}
                  spotBalances={spotBalances}
                  openOrders={perpOpenOrders}
                  fills={perpFills}
                  funding={funding}
                  orderHistory={orderHistory.filter((o) => !isHlSpotCoin(o.coin))}
                  twapOrders={twapOrders.filter((t) => !isHlSpotCoin(t.coin))}
                  markPrices={perpMarkPrices}
                  loading={accountLoading}
                  connected={isConnected}
                  walletAddress={address ?? undefined}
                  activeTab={perpDockTab}
                  onTabChange={setPerpDockTab}
                  onCoinClick={selectChartCoin}
                  actionBusy={tradeBusy}
                  onCancelOrder={async (c, oid) => {
                    await cancelOrder(c, oid, 'perp');
                    await handleRefreshAll();
                  }}
                  onCancelAllOrders={async () => {
                    await cancelAllOrders(perpOpenOrders.map((o) => ({ coin: o.coin, oid: o.oid, marketKind: 'perp' as const })));
                    showToast('All orders cancelled');
                    await handleRefreshAll();
                  }}
                  onCancelTwap={async (c, twapId) => {
                    await cancelTwapOrder(c, twapId, 'perp');
                    showToast('TWAP cancelled');
                    await handleRefreshAll();
                  }}
                  onClosePosition={(p) => void handleClosePosition(p)}
                  positionScope="manual"
                  botManagedCoins={botManagedCoins}
                />
              </div>
        </div>

        <ProTradeOrderPanel
            coin={perpCoin}
            markPx={perpMarkPx}
            maxLeverage={
              perpMarket.snapshot && 'maxLeverage' in perpMarket.snapshot
                ? perpMarket.snapshot.maxLeverage
                : 0
            }
            accountValue={perpTradableUsd}
            limitPrice={limitPrice}
            onLimitPriceChange={setLimitPrice}
            onSuccess={() => {
              showToast('Order submitted');
              void handleRefreshAll();
            }}
            onDeposit={() => setFundsModal('deposit')}
            onWithdraw={() => setFundsModal('withdraw')}
            onTransfer={() => setTransferOpen(true)}
            variant="perp"
            serverTwap={activePerpTwap}
            onCancelServerTwap={async () => {
              if (!activePerpTwap) return;
              await cancelTwapOrder(activePerpTwap.coin, activePerpTwap.twapId, 'perp');
              showToast('TWAP cancelled');
              await handleRefreshAll();
            }}
          />
      </div>

      <ProTradeStatusBar
        walletConnected={isConnected}
        wsLive={perpMarket.wsConnected}
        openOrders={perpOpenOrders}
        positions={manualPositions}
        totalUpnl={totalUpnl}
      />
    </div>
  );

  const renderBotTerminal = () => (
    <div className="hl-terminal hl-terminal--bot">
      <ProTradeTickerStrip markets={perpMarkets} coin={perpCoin} onCoinChange={setPerpCoin} />
      <ProTradeMarketBar
        coin={perpCoin}
        markets={perpMarkets}
        marketsLoading={perpMarketsLoading}
        snapshot={perpMarket.snapshot}
        loading={perpMarket.loading}
        onCoinChange={setPerpCoin}
        variant="perp"
      />

      {perpMarket.error ? (
        <div style={{ padding: '8px 12px', color: '#ef5350', fontSize: 12 }} role="alert">
          {perpMarket.error}
        </div>
      ) : null}

      <div className="hl-body">
        <div className="hl-workspace-main">
          <div className="hl-chart-row">
            <div className="hl-bot-chart-stack">
              <ProTradeChart
                coin={perpCoin}
                interval={interval}
                candles={perpMarket.candles}
                loading={perpMarket.loading}
                openOrders={perpOpenOrders}
                onIntervalChange={setInterval}
                layoutKey={`bot-${perpCoin}`}
                markPx={chartMarkPx}
                positionOverlay={botChartOverlay}
                tradeMarkers={botTradeMarkers}
                onChartRetry={() => void perpMarket.refresh()}
                wsConnected={perpMarket.wsConnected}
                chartError={perpMarket.error}
                fetchAttempts={perpMarket.fetchAttempts}
              />
              <ProTradeBotAnalysis
                walletConnected={isConnected}
                perpCoin={perpCoin}
                scanCoin={botScanCoin}
                openPositionCoins={botOpenPositionCoins}
              />
            </div>
            <ProTradeOrderBook
              book={perpMarket.book}
              recentTrades={perpMarket.recentTrades}
              markPx={perpMarkPx}
              coin={perpCoin}
              onPriceClick={(px) => setLimitPrice(String(px))}
            />
          </div>
          <ProTradeBotDockSlot
            dockTab={botDockTab}
            onDockTabChange={setBotDockTab}
            analysisSymbol={hlCoinToBotSymbol(botScanCoin)}
            openPositionCoins={botOpenPositionCoins}
            botManagedCoins={botManagedCoins}
            onCoinClick={selectChartCoin}
            onDeposit={() => setFundsModal('deposit')}
          />
        </div>

        <ProTradeBotPanelSlot
          onOpenHistory={() => setBotDockTab('tradeHistory')}
          onRequireSignIn={promptSignIn}
        />
      </div>

      <ProTradeBotStatusBar walletConnected={isConnected} wsLive={perpMarket.wsConnected} />
    </div>
  );

  return (
    <PlatformFeeProvider wallet={address ?? null} enabled={isConnected}>
      <>
      <ProTradeTopNav
        section={section}
        onSectionChange={handleSectionChange}
        botOpenCount={botBadge.count}
        botOpenTone={botBadge.tone}
        onOpenSupport={openSupport}
        onSupportNavigate={openSupport}
        onOpenAffiliate={openAffiliate}
        onOpenProfile={openProfile}
        onRequireSignIn={promptSignIn}
        onViewNotificationHistory={openNotificationHistory}
        walletAddress={address ?? undefined}
        walletConnected={isConnected}
      />

      {section === 'perps' || section === 'bot' ? (
        <ProTradeBotProvider>
          {section === 'perps' ? renderPerpTerminal() : null}
          {section === 'bot' ? renderBotTerminal() : null}
        </ProTradeBotProvider>
      ) : null}
      {section === 'profile' ? (
        <div className="hl-terminal hl-terminal--profile">
          <ProTradeProfile
            activeTab={profileTab}
            onTabChange={handleProfileTabChange}
            botHistoryRefreshKey={botSyncTick}
            onRequireSignIn={promptSignIn}
          />
        </div>
      ) : null}
      {section === 'sportsbets' ? (
        <ProTradeSportsbets
          walletConnected={isConnected}
          walletAddress={address ?? undefined}
          onRequireSignIn={promptSignIn}
        />
      ) : null}
      {section === 'perps' || section === 'bot' ? (
        <ProTradeMobileTradeFab
          key={section}
          label={section === 'bot' ? 'Bot panel' : 'Buy / Sell'}
        />
      ) : null}

      {section === 'support' ? (
        <div className="hl-terminal hl-terminal--support">
          <ProTradeSupport onRequireSignIn={promptSignIn} />
        </div>
      ) : null}
      {section === 'portfolio' ? (
        <div className="hl-terminal hl-terminal--portfolio">
        <ProTradePortfolio
          account={account}
          spotBalances={spotBalances}
          spotPrices={spotTokenPrices}
          loading={accountLoading}
          connected={isConnected}
          walletAddress={(hlActiveWallet ?? address)?.toLowerCase()}
          onNavigatePerps={(coin) => {
            selectChartCoin(coin);
            setSection('perps');
          }}
          onNavigateBetting={() => setSection('sportsbets')}
          onNavigateAffiliate={openAffiliate}
          onRequireSignIn={promptSignIn}
        />
        </div>
      ) : null}
      {section === 'news' ? (
        <div className="hl-terminal hl-terminal--news">
          <ProTradeNews
            walletAddress={address ?? undefined}
            onTradeCrypto={(coin) => {
              selectChartCoin(coin);
              handleSectionChange('perps');
            }}
            onTradeSports={() => {
              handleSectionChange('sportsbets');
              setToast('Open the matched event in Betting');
              window.setTimeout(() => setToast(null), 4000);
            }}
          />
        </div>
      ) : null}
      {section === 'affiliate' ? (
        <div className="hl-terminal hl-terminal--affiliate">
          <ProTradeAffiliate onRequireSignIn={promptSignIn} />
        </div>
      ) : null}
      {section === 'leaderboard' ? (
        <div className="hl-terminal hl-terminal--leaderboard">
          <ProTradeLeaderboard />
        </div>
      ) : null}

      {toast ? <div className="hl-toast">{toast}</div> : null}

      {fundsModal ? (
        <ProTradeDepositModal
          initialTab={fundsModal}
          withdrawable={String(hlWithdrawable)}
          hlBalanceUsd={hlTotalUsd}
          spotUsdc={spotUsdc}
          onClose={() => setFundsModal(null)}
          onSuccess={() => void handleRefreshAll()}
          onTransfer={() => {
            setFundsModal(null);
            setTransferOpen(true);
          }}
        />
      ) : null}

      {authModal
        ? createPortal(
            <div
              className="hl-modal-backdrop hl-modal-backdrop--auth"
              role="presentation"
              onClick={closeAuthModal}
            >
              {authModal === 'signin' ? (
                <ProTradeSignInModal
                  key="signin"
                  embedded
                  open
                  reason={signInReason}
                  onClose={closeAuthModal}
                  onSwitchToRegister={switchToRegister}
                />
              ) : (
                <ProTradeRegisterModal
                  key="register"
                  embedded
                  open
                  onClose={closeAuthModal}
                  onSwitchToSignIn={switchToSignIn}
                />
              )}
            </div>,
            document.body
          )
        : null}

      {transferOpen ? (
        <ProTradeTransferModal
          perpAvailable={perpWithdrawable}
          spotUsdc={spotUsdc}
          onClose={() => setTransferOpen(false)}
          onSuccess={() => void handleRefreshAll()}
        />
      ) : null}
      </>
    </PlatformFeeProvider>
  );
};

const Dashboard2ProPage: React.FC = () => (
  <ProTradeShell>
    <LegalAcceptanceProvider>
      <BettingUiProvider>
        <Dashboard2ProPageContent />
        <MonadierWalletAccountSheet />
      </BettingUiProvider>
    </LegalAcceptanceProvider>
  </ProTradeShell>
);

export default Dashboard2ProPage;
