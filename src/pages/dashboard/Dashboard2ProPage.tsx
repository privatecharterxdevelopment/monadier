import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import ProTradeShell from '../../components/protrade/ProTradeShell';
import ProTradeTopNav, { type ProTradeSection } from '../../components/protrade/ProTradeTopNav';
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
import ProTradeSwap from '../../components/protrade/ProTradeSwap';
import { useHyperliquidMarket } from '../../hooks/useHyperliquidMarket';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { useHyperliquidMarkets } from '../../hooks/useHyperliquidMarkets';
import { useHyperliquidSpotMarkets } from '../../hooks/useHyperliquidSpotMarkets';
import { useHyperliquidMarkPrices } from '../../hooks/useHyperliquidMarkPrices';
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

const Dashboard2ProPage: React.FC = () => {
  const { address, isConnected } = useAppKitAccount();
  const [section, setSection] = useState<ProTradeSection>('perps');
  const [perpCoin, setPerpCoin] = useState(DEFAULT_PRO_COIN);
  const [spotCoin, setSpotCoin] = useState(DEFAULT_SPOT_COIN);
  const [interval, setInterval] = useState<HlInterval>(DEFAULT_PRO_INTERVAL);
  const [limitPrice, setLimitPrice] = useState('');
  const [fundsModal, setFundsModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [perpDockTab, setPerpDockTab] = useState<ProTradeDockTab>('positions');
  const [spotDockTab, setSpotDockTab] = useState<ProTradeDockTab>('balances');
  const [toast, setToast] = useState<string | null>(null);

  const { markets: perpMarkets, loading: perpMarketsLoading, refresh: refreshPerpMarkets } =
    useHyperliquidMarkets();
  const { markets: spotMarkets, loading: spotMarketsLoading, refresh: refreshSpotMarkets } =
    useHyperliquidSpotMarkets();

  const perpMarket = useHyperliquidMarket(perpCoin, interval, 'perp');
  const spotMarket = useHyperliquidMarket(spotCoin, interval, 'spot');
  const swapMarket = useHyperliquidMarket(DEFAULT_SWAP_COIN, interval, 'spot');

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
  const spotFills = useMemo(
    () => fills.filter((f) => isHlSpotCoin(f.coin)),
    [fills]
  );

  const positionCoins = useMemo(
    () => (account?.positions ?? []).map((p) => p.coin),
    [account?.positions]
  );
  const { prices: positionMarkPrices } = useHyperliquidMarkPrices(positionCoins);

  const perpAccountValue = readNum(account, ['margin', 'accountValue']);
  const perpWithdrawable = toNum(account?.withdrawable);
  const spotUsdc = useMemo(
    () => toNum(spotBalances.find((b) => b.coin === 'USDC')?.total),
    [spotBalances]
  );

  const perpMarkPx = toNum(perpMarket.snapshot?.markPx);
  const spotMarkPx = toNum(spotMarket.snapshot?.markPx);
  const spotDisplayName = spotLabel(spotCoin);

  const totalUpnl = useMemo(
    () => (account?.positions ?? []).reduce((s, p) => s + toNum(p.unrealizedPnl), 0),
    [account?.positions]
  );

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
    await closePosition({ coin: position.coin, size, isLong, markPx: px });
    showToast('Position close submitted');
    await handleRefreshAll();
  };

  const renderPerpTerminal = () => (
    <>
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
            />
            <ProTradeOrderBook
              book={perpMarket.book}
              recentTrades={perpMarket.recentTrades}
              markPx={perpMarkPx}
              coin={perpCoin}
              onPriceClick={(px) => setLimitPrice(String(px))}
            />
          </div>
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
        />
      </div>

      <ProTradeStatusBar
        walletConnected={isConnected}
        wsLive={perpMarket.wsConnected}
        openOrders={perpOpenOrders}
        positions={account?.positions ?? []}
        totalUpnl={totalUpnl}
      />
    </>
  );

  const renderSpotTerminal = () => (
    <>
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
              interval={interval}
              candles={spotMarket.candles}
              loading={spotMarket.loading}
              openOrders={spotOpenOrders}
              onIntervalChange={setInterval}
            />
            <ProTradeOrderBook
              book={spotMarket.book}
              recentTrades={spotMarket.recentTrades}
              markPx={spotMarkPx}
              coin={spotDisplayName}
              onPriceClick={(px) => setLimitPrice(String(px))}
            />
          </div>
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
        />
      </div>

      <ProTradeStatusBar
        walletConnected={isConnected}
        wsLive={spotMarket.wsConnected}
        openOrders={spotOpenOrders}
        positions={[]}
        totalUpnl={0}
      />
    </>
  );

  return (
    <ProTradeShell>
      <ProTradeTopNav section={section} onSectionChange={setSection} />

      {section === 'perps' ? renderPerpTerminal() : null}
      {section === 'spot' ? renderSpotTerminal() : null}
      {section === 'swap' ? (
        <ProTradeSwap
          spotBalances={spotBalances}
          markPx={toNum(swapMarket.snapshot?.markPx)}
          onSuccess={() => void handleRefreshAll()}
        />
      ) : null}
      {section === 'portfolio' ? (
        <ProTradePortfolio
          account={account}
          spotBalances={spotBalances}
          loading={accountLoading}
          connected={isConnected}
        />
      ) : null}

      {toast ? <div className="hl-toast">{toast}</div> : null}

      {fundsModal ? (
        <ProTradeDepositModal
          initialTab={fundsModal}
          withdrawable={account?.withdrawable}
          onClose={() => setFundsModal(null)}
          onSuccess={() => void handleRefreshAll()}
        />
      ) : null}

      {transferOpen ? (
        <ProTradeTransferModal
          perpAvailable={perpWithdrawable}
          spotUsdc={spotUsdc}
          onClose={() => setTransferOpen(false)}
          onSuccess={() => void handleRefreshAll()}
        />
      ) : null}
    </ProTradeShell>
  );
};

export default Dashboard2ProPage;
