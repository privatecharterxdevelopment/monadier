import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import ProTradeShell from '../../components/protrade/ProTradeShell';
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
import { BettingUiProvider, useBettingUi } from '../../contexts/BettingUiContext';
import type { ProTradeProfileTab } from '../../components/protrade/proTradeProfileTypes';
import type { ActivityNotification } from '../../lib/activityNotifications';
import { useHyperliquidMarket } from '../../hooks/useHyperliquidMarket';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHlBotChartOverlay } from '../../hooks/useHlBotChartOverlay';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
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
  const initialSection = searchParams.get('section');
  const [section, setSection] = useState<ProTradeSection>(() => {
    if (initialSection === 'bot') return 'bot';
    if (initialSection === 'news') return 'news';
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
  } = useHyperliquidAccount(address);
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

  const botChartCoin = section === 'bot' ? perpCoin : undefined;
  const { seriesMarkers: botTradeMarkers } = useHlBotChartMarkers(
    address,
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
  const perpWithdrawable = toNum(account?.withdrawable);
  const spotUsdc = useMemo(
    () => toNum(spotBalances.find((b) => b.coin === 'USDC')?.total),
    [spotBalances]
  );

  const perpMarkPx = toNum(perpMarket.snapshot?.markPx);

  const activePerpTwap = useMemo(
    () =>
      twapOrders.find(
        (t) => t.status === 'activated' && t.coin === perpCoin && !isHlSpotCoin(t.coin)
      ) ?? null,
    [twapOrders, perpCoin]
  );

  const totalUpnl = useMemo(
    () => (account?.positions ?? []).reduce((s, p) => s + toNum(p.unrealizedPnl), 0),
    [account?.positions]
  );

  const botOpenPosition = useMemo(() => {
    const list = account?.positions ?? [];
    return list.find((p) => Math.abs(toNum(p.szi)) > 0) ?? null;
  }, [account?.positions]);

  /** Open HL position on the chart's active coin (not always the first in the list). */
  const botChartPosition = useMemo(
    () =>
      (account?.positions ?? []).find(
        (p) =>
          normalizeHlPerpCoin(p.coin) === normalizeHlPerpCoin(perpCoin) &&
          Math.abs(toNum(p.szi)) > 0
      ) ?? null,
    [account?.positions, perpCoin]
  );

  const botOpenPositionCount = useMemo(
    () => (account?.positions ?? []).filter((p) => Math.abs(toNum(p.szi)) > 0).length,
    [account?.positions]
  );

  const botOpenPositionCoins = useMemo(
    () =>
      (account?.positions ?? [])
        .filter((p) => Math.abs(toNum(p.szi)) > 0)
        .map((p) => p.coin),
    [account?.positions]
  );

  const { settings: botVaultSettings, wallet: botTradingWallet, reload: reloadBotSettings } =
    useTerminalBotSettings(botSyncTick);
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

  const perpChartPosition = useMemo(
    () =>
      (account?.positions ?? []).find(
        (p) =>
          normalizeHlPerpCoin(p.coin) === normalizeHlPerpCoin(perpCoin) &&
          Math.abs(toNum(p.szi)) > 0
      ) ?? null,
    [account?.positions, perpCoin]
  );

  const perpChartOverlay = useHlBotChartOverlay(
    perpChartPosition,
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
    const openMatch = botOpenPositionCoins.find((c) => normalizeHlPerpCoin(c) === norm);
    if (openMatch) return;
    setPerpCoin(DEFAULT_PRO_COIN);
  }, [perpMarkets, perpCoin, botOpenPositionCoins]);

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
    setSection(next);
    setFundsModal(null);
    if (next === 'bot' || next === 'sportsbets' || next === 'support' || next === 'news') {
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

  const handleBotTradeToggle = () => {
    setFundsModal(null);
    if (section === 'bot') {
      handleSectionChange('perps');
    } else {
      setBotDockTab('positions');
      handleSectionChange('bot');
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
    await Promise.all([perpMarket.refresh(), refreshAccount(), refreshPerpMarkets()]);
  };

  const openSupport = () => {
    handleSectionChange('support');
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const onBotMinBalanceStopped = useCallback(() => {
    void reloadBotSettings();
    void handleRefreshAll();
    showToast('Bot paused — deposit at least $20 USDC on Hyperliquid');
  }, [reloadBotSettings, handleRefreshAll]);

  useHlBotMinBalanceGuard({
    wallet: botTradingWallet ?? address,
    hlBalanceUsd: perpAccountValue,
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
              layoutKey={`perps-${perpCoin}-${interval}`}
              markPx={perpMarkPx}
              positionOverlay={perpChartOverlay}
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
                  openOrders={perpOpenOrders}
                  fills={perpFills}
                  funding={funding}
                  orderHistory={orderHistory.filter((o) => !isHlSpotCoin(o.coin))}
                  twapOrders={twapOrders.filter((t) => !isHlSpotCoin(t.coin))}
                  markPrices={perpMarkPrices}
                  loading={accountLoading}
                  connected={isConnected}
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
            accountValue={perpAccountValue}
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
        positions={account?.positions ?? []}
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
                layoutKey={`bot-${perpCoin}-${interval}`}
                markPx={perpMarkPx}
                positionOverlay={botChartOverlay}
                tradeMarkers={botTradeMarkers}
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
    <>
      <ProTradeTopNav
        section={section}
        onSectionChange={handleSectionChange}
        onBotTradeToggle={handleBotTradeToggle}
        botOpenCount={botBadge.count}
        botOpenTone={botBadge.tone}
        onOpenSupport={openSupport}
        onSupportNavigate={openSupport}
        onOpenProfile={openProfile}
        onRequireSignIn={promptSignIn}
        onViewNotificationHistory={openNotificationHistory}
        walletAddress={address ?? undefined}
        walletConnected={isConnected}
      />

      {section === 'perps' ? renderPerpTerminal() : null}
      {section === 'bot' ? (
        <ProTradeBotProvider>{renderBotTerminal()}</ProTradeBotProvider>
      ) : null}
      {section === 'profile' ? (
        <ProTradeProfile
          activeTab={profileTab}
          onTabChange={handleProfileTabChange}
          botHistoryRefreshKey={botSyncTick}
        />
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
        <ProTradeSupport onRequireSignIn={promptSignIn} />
      ) : null}
      {section === 'portfolio' ? (
        <div className="hl-terminal">
        <ProTradePortfolio
          account={account}
          spotBalances={spotBalances}
          spotPrices={spotTokenPrices}
          loading={accountLoading}
          connected={isConnected}
          walletAddress={address ?? undefined}
          onNavigatePerps={(coin) => {
            selectChartCoin(coin);
            setSection('perps');
          }}
          onNavigateBetting={() => setSection('sportsbets')}
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

      {toast ? <div className="hl-toast">{toast}</div> : null}

      {fundsModal && (section === 'perps' || section === 'sportsbets') ? (
        <ProTradeDepositModal
          mode={section === 'sportsbets' ? 'betting' : 'perps'}
          initialTab={fundsModal}
          withdrawable={section === 'sportsbets' ? String(spotUsdc) : account?.withdrawable}
          hlBalanceUsd={section === 'sportsbets' ? spotUsdc : perpAccountValue}
          onClose={() => setFundsModal(null)}
          onSuccess={() => void handleRefreshAll()}
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
  );
};

const Dashboard2ProPage: React.FC = () => (
  <ProTradeShell>
    <BettingUiProvider>
      <Dashboard2ProPageContent />
    </BettingUiProvider>
  </ProTradeShell>
);

export default Dashboard2ProPage;
