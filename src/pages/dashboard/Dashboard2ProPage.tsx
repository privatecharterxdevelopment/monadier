import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppKitAccount } from '@reown/appkit/react';
import ProTradeShell from '../../components/protrade/ProTradeShell';
import ProTradeTopNav, { type ProTradeSection } from '../../components/protrade/ProTradeTopNav';
import ProTradeMobileTradeFab from '../../components/protrade/ProTradeMobileTradeFab';
import ProTradeProfile from '../../components/protrade/ProTradeProfile';
import ProTradeBotHistory from '../../components/protrade/ProTradeBotHistory';
import {
  ProTradeBotDockSlot,
  ProTradeBotPanelSlot,
  ProTradeBotProvider,
  ProTradeBotStatusBar,
} from '../../components/protrade/ProTradeBotSide';
import type { HlBotDockTab } from '../../components/protrade/ProTradeHlBotDock';
import ProTradeTickerStrip from '../../components/protrade/ProTradeTickerStrip';
import ProTradeMarketBar from '../../components/protrade/ProTradeMarketBar';
import ProTradeChart from '../../components/protrade/ProTradeChart';
import ProTradeOrderBook from '../../components/protrade/ProTradeOrderBook';
import ProTradeOrderPanel from '../../components/protrade/ProTradeOrderPanel';
import ProTradeDock, { type ProTradeDockTab } from '../../components/protrade/ProTradeDock';
import ProTradeStatusBar from '../../components/protrade/ProTradeStatusBar';
import TerminalSupportModal from '../../components/terminal/TerminalSupportModal';
import ProTradeDepositModal from '../../components/protrade/ProTradeDepositModal';
import ProTradeTransferModal from '../../components/protrade/ProTradeTransferModal';
import ProTradePortfolio from '../../components/protrade/ProTradePortfolio';
import ProTradeSwap from '../../components/protrade/ProTradeSwap';
import { useHyperliquidMarket } from '../../hooks/useHyperliquidMarket';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHlBotChartOverlay } from '../../hooks/useHlBotChartOverlay';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { useHyperliquidMarkets } from '../../hooks/useHyperliquidMarkets';
import { useHyperliquidSpotMarkets } from '../../hooks/useHyperliquidSpotMarkets';
import { useHyperliquidMarkPrices } from '../../hooks/useHyperliquidMarkPrices';
import { useHyperliquidSpotPrices } from '../../hooks/useHyperliquidSpotPrices';
import {
  DEFAULT_PRO_COIN,
  DEFAULT_PRO_INTERVAL,
  DEFAULT_SPOT_COIN,
  DEFAULT_SWAP_COIN,
} from '../../lib/hyperliquid/constants';
import type { HlInterval } from '../../lib/hyperliquid/types';
import type { HlPosition } from '../../lib/hyperliquid/user';
import type { HlMarket } from '../../lib/hyperliquid/markets';
import { getSpotDisplayName, isHlSpotCoin } from '../../lib/hyperliquid/spot';
import { readNum, toNum } from '../../lib/hyperliquid/parse';
import { hlCoinToBotSymbol } from '../../lib/botTradingPairs';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { useBotServerBlockers } from '../../hooks/useBotServerBlockers';
import { useBotPositionBadge } from '../../hooks/useBotPositionBadge';
import { useAuth } from '../../contexts/AuthContext';
import ProTradeSignInModal from '../../components/protrade/ProTradeSignInModal';
import ProTradeRegisterModal from '../../components/protrade/ProTradeRegisterModal';
import { useHlBotChartMarkers } from '../../hooks/useHlBotChartMarkers';
import { useProTradeTheme } from '../../contexts/ProTradeThemeContext';
import { getProTradeChartColors } from '../../lib/proTradeTheme';

const PROFILE_TABS = new Set<ProTradeProfileTab>(['identity', 'security', 'wallets', 'history']);

function parseProfileTab(raw: string | null): ProTradeProfileTab {
  if (raw && PROFILE_TABS.has(raw as ProTradeProfileTab)) {
    return raw as ProTradeProfileTab;
  }
  return 'identity';
}

const Dashboard2ProPageContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, sessionReady } = useAuth();
  const { address, isConnected } = useAppKitAccount();
  const initialSection = searchParams.get('section');
  const [section, setSection] = useState<ProTradeSection>(() => {
    if (initialSection === 'bot') return 'bot';
    return 'perps';
  });
  const [perpCoin, setPerpCoin] = useState(DEFAULT_PRO_COIN);
  const [spotCoin, setSpotCoin] = useState(DEFAULT_SPOT_COIN);
  const [interval, setInterval] = useState<HlInterval>(DEFAULT_PRO_INTERVAL);
  const [limitPrice, setLimitPrice] = useState('');
  const [fundsModal, setFundsModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [perpDockTab, setPerpDockTab] = useState<ProTradeDockTab>('positions');
  const [spotDockTab, setSpotDockTab] = useState<ProTradeDockTab>('balances');
  const [botDockTab, setBotDockTab] = useState<HlBotDockTab>('positions');
  const [toast, setToast] = useState<string | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [authModal, setAuthModal] = useState<'signin' | 'register' | null>(null);
  const [signInReason, setSignInReason] = useState<string | undefined>();
  const [botSyncTick, setBotSyncTick] = useState(0);
  const [historyHighlightId, setHistoryHighlightId] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<ProTradeProfileTab>(() =>
    parseProfileTab(searchParams.get('tab'))
  );
  const { badge: botBadge } = useBotPositionBadge(botSyncTick);
  const { theme } = useProTradeTheme();
  const chartMarkerColors = useMemo(() => getProTradeChartColors(theme), [theme]);

  const { markets: perpMarkets, loading: perpMarketsLoading, refresh: refreshPerpMarkets } =
    useHyperliquidMarkets();
  const { markets: spotMarkets, loading: spotMarketsLoading, refresh: refreshSpotMarkets } =
    useHyperliquidSpotMarkets();

  const perpMarket = useHyperliquidMarket(perpCoin, interval, 'perp', {
    enabled: section === 'perps' || section === 'bot',
  });
  const spotMarket = useHyperliquidMarket(spotCoin, interval, 'spot', {
    enabled: section === 'spot',
  });
  const swapMarket = useHyperliquidMarket(DEFAULT_SWAP_COIN, interval, 'spot', {
    enabled: section === 'swap',
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

  const spotMarketsAsHl: HlMarket[] = useMemo(
    () =>
      spotMarkets.map((m) => ({
        name: m.name,
        maxLeverage: 1,
        szDecimals: m.szDecimals,
        markPx: m.markPx,
        change24hPct: m.change24hPct,
        dayVolumeUsd: m.dayVolumeUsd,
        fundingRate: 0,
        openInterestUsd: 0,
      })),
    [spotMarkets]
  );

  const spotLabel = useCallback(
    (name: string) => spotMarkets.find((m) => m.name === name)?.displayName ?? getSpotDisplayName(name),
    [spotMarkets]
  );

  const perpOpenOrders = useMemo(
    () => openOrders.filter((o) => !isHlSpotCoin(o.coin)),
    [openOrders]
  );
  const spotOpenOrders = useMemo(
    () => openOrders.filter((o) => isHlSpotCoin(o.coin)),
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
  const spotFills = useMemo(
    () => fills.filter((f) => isHlSpotCoin(f.coin)),
    [fills]
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
  const spotMarkPx = toNum(spotMarket.snapshot?.markPx);
  const spotDisplayName = spotLabel(spotCoin);

  const activePerpTwap = useMemo(
    () =>
      twapOrders.find(
        (t) => t.status === 'activated' && t.coin === perpCoin && !isHlSpotCoin(t.coin)
      ) ?? null,
    [twapOrders, perpCoin]
  );
  const activeSpotTwap = useMemo(
    () =>
      twapOrders.find(
        (t) => t.status === 'activated' && t.coin === spotCoin && isHlSpotCoin(t.coin)
      ) ?? null,
    [twapOrders, spotCoin]
  );

  const totalUpnl = useMemo(
    () => (account?.positions ?? []).reduce((s, p) => s + toNum(p.unrealizedPnl), 0),
    [account?.positions]
  );

  const botOpenPosition = useMemo(() => {
    const list = account?.positions ?? [];
    return list.find((p) => Math.abs(toNum(p.szi)) > 0) ?? null;
  }, [account?.positions]);

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

  const { settings: botVaultSettings } = useTerminalBotSettings();
  const botServerStatus = useBotServerBlockers(
    address?.toLowerCase(),
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

  const botChartOverlay = useHlBotChartOverlay(
    botOpenPosition,
    botScanCoin,
    botVaultSettings.hlBotStrategy
  );

  useEffect(() => {
    if (section !== 'bot') return;
    if (botScanCoin && botScanCoin !== perpCoin) {
      setPerpCoin(botScanCoin);
    }
  }, [section, botScanCoin, perpCoin]);

  const perpMarkPrices = useMemo(() => {
    const map = { ...positionMarkPrices };
    if (perpMarkPx > 0) map[perpCoin] = perpMarkPx;
    return map;
  }, [positionMarkPrices, perpCoin, perpMarkPx]);

  useEffect(() => {
    if (perpMarkets.length === 0) return;
    const valid = new Set(perpMarkets.map((m) => m.name));
    if (!valid.has(perpCoin)) setPerpCoin(DEFAULT_PRO_COIN);
  }, [perpMarkets, perpCoin]);

  useEffect(() => {
    if (spotMarkets.length === 0) return;
    const valid = new Set(spotMarkets.map((m) => m.name));
    if (!valid.has(spotCoin)) setSpotCoin(spotMarkets[0]?.name ?? DEFAULT_SPOT_COIN);
  }, [spotMarkets, spotCoin]);

  const closeAuthModal = useCallback(() => {
    setAuthModal(null);
    setSignInReason(undefined);
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
    if (next === 'history' && !requireAuth('Sign in to view bot trade history from Supabase.')) {
      return;
    }
    setSection(next);
    setFundsModal(null);
    if (next === 'bot' || next === 'history') {
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
      if (urlSection === 'profile' || urlSection === 'history') {
        setProfileTab(urlTab);
      }
      return;
    }
    if (urlSection === 'profile') {
      setProfileTab(urlTab);
      setSection('profile');
    } else if (urlSection === 'history') {
      setSection('history');
    } else if (urlSection === 'bot') {
      setSection('bot');
    }
  }, [searchParams, sessionReady, user]);

  useEffect(() => {
    if (!sessionReady || user) return;
    if (section !== 'profile' && section !== 'history') return;

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
      spotMarket.refresh(),
      swapMarket.refresh(),
      refreshAccount(),
      refreshPerpMarkets(),
      refreshSpotMarkets(),
    ]);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const handleClosePosition = async (position: HlPosition) => {
    const size = Math.abs(toNum(position.szi));
    const isLong = toNum(position.szi) >= 0;
    const px = perpMarkPrices[position.coin] ?? perpMarkPx;
    if (size <= 0 || px <= 0) return;
    const profitUsd = Math.max(0, toNum(position.unrealizedPnl));
    await closePosition({ coin: position.coin, size, isLong, markPx: px, profitUsd });
    await handleRefreshAll();
  };

  const openBotHistory = (tradeId?: string) => {
    if (!requireAuth('Sign in to view bot trade notifications and history.')) return;
    setHistoryHighlightId(tradeId ?? null);
    handleSectionChange('history');
    if (tradeId) {
      window.setTimeout(() => setHistoryHighlightId(null), 4500);
    }
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
                  onCoinClick={setPerpCoin}
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
            <ProTradeChart
              coin={perpCoin}
              interval={interval}
              candles={perpMarket.candles}
              loading={perpMarket.loading}
              openOrders={perpOpenOrders}
              onIntervalChange={setInterval}
              layoutKey={`bot-${perpCoin}-${interval}`}
              positionOverlay={botChartOverlay}
              tradeMarkers={botTradeMarkers}
            />
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
            onCoinClick={setPerpCoin}
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

  const renderSpotTerminal = () => (
    <div className="hl-terminal">
      <ProTradeTickerStrip
        markets={spotMarketsAsHl}
        coin={spotCoin}
        onCoinChange={setSpotCoin}
        resolveLabel={spotLabel}
      />
      <ProTradeMarketBar
        coin={spotCoin}
        markets={spotMarketsAsHl}
        marketsLoading={spotMarketsLoading}
        snapshot={spotMarket.snapshot}
        loading={spotMarket.loading}
        onCoinChange={setSpotCoin}
        variant="spot"
        displayName={spotDisplayName}
        resolveLabel={spotLabel}
      />

      {spotMarket.error ? (
        <div style={{ padding: '8px 12px', color: '#ef5350', fontSize: 12 }} role="alert">
          {spotMarket.error}
        </div>
      ) : null}

      <div className="hl-body">
        <div className="hl-workspace-main">
          <div className="hl-chart-row">
            <ProTradeChart
              coin={spotDisplayName}
              orderCoin={spotCoin}
              interval={interval}
              candles={spotMarket.candles}
              loading={spotMarket.loading}
              openOrders={spotOpenOrders}
              onIntervalChange={setInterval}
              layoutKey={`spot-${spotCoin}-${interval}`}
            />
            <ProTradeOrderBook
              book={spotMarket.book}
              recentTrades={spotMarket.recentTrades}
              markPx={spotMarkPx}
              coin={spotDisplayName}
              onPriceClick={(px) => setLimitPrice(String(px))}
            />
          </div>
          <div className="hl-dock hl-hl-dock">
            <div className="hl-dock-mode-label">Hyperliquid · Spot account</div>
            <ProTradeDock
              account={account}
              spotBalances={spotBalances}
              openOrders={spotOpenOrders}
              fills={spotFills}
              funding={[]}
              orderHistory={orderHistory.filter((o) => isHlSpotCoin(o.coin))}
              twapOrders={twapOrders.filter((t) => isHlSpotCoin(t.coin))}
              markPrices={{}}
              loading={accountLoading}
              connected={isConnected}
              activeTab={spotDockTab}
              onTabChange={setSpotDockTab}
              onCoinClick={setSpotCoin}
              actionBusy={tradeBusy}
              variant="spot"
              onCancelOrder={async (c, oid) => {
                await cancelOrder(c, oid, 'spot');
                await handleRefreshAll();
              }}
              onCancelAllOrders={async () => {
                await cancelAllOrders(spotOpenOrders.map((o) => ({ coin: o.coin, oid: o.oid, marketKind: 'spot' as const })));
                showToast('All orders cancelled');
                await handleRefreshAll();
              }}
              onCancelTwap={async (c, twapId) => {
                await cancelTwapOrder(c, twapId, 'spot');
                showToast('TWAP cancelled');
                await handleRefreshAll();
              }}
            />
          </div>
        </div>

        <ProTradeOrderPanel
          coin={spotCoin}
          displayCoin={spotDisplayName}
          markPx={spotMarkPx}
          maxLeverage={1}
          accountValue={spotUsdc}
          limitPrice={limitPrice}
          onLimitPriceChange={setLimitPrice}
          onSuccess={() => {
            showToast('Order submitted');
            void handleRefreshAll();
          }}
          onDeposit={() => setFundsModal('deposit')}
          onWithdraw={() => setFundsModal('withdraw')}
          onTransfer={() => setTransferOpen(true)}
          variant="spot"
          serverTwap={activeSpotTwap}
          onCancelServerTwap={async () => {
            if (!activeSpotTwap) return;
            await cancelTwapOrder(activeSpotTwap.coin, activeSpotTwap.twapId, 'spot');
            showToast('TWAP cancelled');
            await handleRefreshAll();
          }}
        />
      </div>

      <ProTradeStatusBar
        walletConnected={isConnected}
        wsLive={spotMarket.wsConnected}
        openOrders={spotOpenOrders}
        positions={[]}
        totalUpnl={0}
      />
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
        onOpenSupport={() => {
          if (requireAuth('Sign in to contact support.')) setShowSupport(true);
        }}
        onOpenProfile={openProfile}
        onOpenBotHistory={() => openBotHistory()}
        onRequireSignIn={promptSignIn}
        onViewNotificationHistory={(tradeId) => openBotHistory(tradeId)}
      />

      {section === 'perps' ? renderPerpTerminal() : null}
      {section === 'bot' ? (
        <ProTradeBotProvider>{renderBotTerminal()}</ProTradeBotProvider>
      ) : null}
      {section === 'profile' ? (
        <ProTradeProfile activeTab={profileTab} onTabChange={handleProfileTabChange} />
      ) : null}
      {section === 'history' ? (
        <ProTradeBotHistory
          refreshKey={botSyncTick}
          walletAddress={address ?? undefined}
          walletConnected={isConnected}
        />
      ) : null}
      {section === 'spot' ? renderSpotTerminal() : null}
      {section === 'perps' || section === 'spot' || section === 'bot' ? (
        <ProTradeMobileTradeFab
          key={section}
          label={section === 'bot' ? 'Bot panel' : 'Buy / Sell'}
        />
      ) : null}

      {section === 'swap' ? (
        <div className="hl-terminal">
          <ProTradeSwap
            spotBalances={spotBalances}
            markPx={toNum(swapMarket.snapshot?.markPx)}
            book={swapMarket.book}
            onSuccess={() => void handleRefreshAll()}
          />
        </div>
      ) : null}
      {section === 'portfolio' ? (
        <div className="hl-terminal">
        <ProTradePortfolio
          account={account}
          spotBalances={spotBalances}
          spotPrices={spotTokenPrices}
          loading={accountLoading}
          connected={isConnected}
          onNavigatePerps={(coin) => {
            setPerpCoin(coin);
            setSection('perps');
          }}
          onNavigateSpot={(token) => {
            const pair =
              spotMarkets.find((m) => m.baseToken === token)?.name ??
              spotMarkets.find((m) => m.displayName.startsWith(`${token}/`))?.name;
            if (pair) setSpotCoin(pair);
            setSection('spot');
          }}
        />
        </div>
      ) : null}

      {toast ? <div className="hl-toast">{toast}</div> : null}

      {fundsModal && (section === 'perps' || section === 'spot') ? (
        <ProTradeDepositModal
          initialTab={fundsModal}
          withdrawable={account?.withdrawable}
          onClose={() => setFundsModal(null)}
          onSuccess={() => void handleRefreshAll()}
        />
      ) : null}

      {showSupport ? (
        <TerminalSupportModal onClose={() => setShowSupport(false)} />
      ) : null}

      {authModal ? (
        <div className="hl-modal-backdrop" role="presentation" onClick={closeAuthModal}>
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
        </div>
      ) : null}

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
    <Dashboard2ProPageContent />
  </ProTradeShell>
);

export default Dashboard2ProPage;
