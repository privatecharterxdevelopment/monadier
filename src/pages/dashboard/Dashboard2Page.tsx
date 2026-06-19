import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wallet, ArrowDownLeft, ArrowUpRight, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { useUserLocale } from '../../hooks/useUserLocale';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useDashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { usePositionReconciliation } from '../../hooks/usePositionReconciliation';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { recordLoginActivity } from '../../lib/loginActivity';
import TerminalTradePanel from '../../components/terminal/TerminalTradePanel';
import ProTradeHlBotDock, { type HlBotDockTab } from '../../components/protrade/ProTradeHlBotDock';
import TradingBotPage from './TradingBotPage';
import Dashboard2Shell from '../../components/dashboard2/Dashboard2Shell';
import type { Dashboard2SidebarSection } from '../../components/dashboard2/Dashboard2Sidebar';
import TerminalBotSettingsModal from '../../components/terminal/TerminalBotSettingsModal';
import ProTradeDepositModal from '../../components/protrade/ProTradeDepositModal';
import TerminalSupportModal from '../../components/terminal/TerminalSupportModal';
import TermNotificationsBell from '../../components/terminal/TermNotificationsBell';
import { getAppEntryPath, goToOpenApp, OPEN_APP_PATH } from '../../lib/appUrls';
import TerminalProfileOnboardingModal from '../../components/terminal/TerminalProfileOnboardingModal';
import type { BotSetupPhase } from '../../components/terminal/TerminalBotSettingsModal';
import { displayHandle } from '../../lib/username';
import { useProfileOnboarding } from '../../hooks/useProfileOnboarding';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { hlCoinToBotSymbol } from '../../lib/botTradingPairs';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';

const MIN_BOT_CAPITAL_USD = MIN_HL_BOT_USD;

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type WorkspaceView = 'trade' | 'history';

const Dashboard2Page: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, user, isDemoUser, isLoading: authLoading, sessionReady } = useAuth();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { totalUsdValue } = useWeb3();
  const { metrics, refresh } = useDashboard2Metrics();
  const { greeting } = useUserLocale();

  const [fundsAction, setFundsAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositTab, setDepositTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showSupport, setShowSupport] = useState(false);
  const [sidebarSection, setSidebarSection] = useState<Dashboard2SidebarSection>('trade');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('trade');
  const [dockTab, setDockTab] = useState<HlBotDockTab>('positions');
  const [chartSymbol, setChartSymbol] = useState('ETHUSDT');

  const botSettings = useTerminalBotSettings(historyTick);
  const hlSetup = useHlBotSetup(address ?? undefined);
  const { needsOnboarding } = useProfileOnboarding(profile, user, isDemoUser);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const showOnboarding =
    sessionReady &&
    !authLoading &&
    Boolean(user) &&
    profile !== null &&
    needsOnboarding &&
    !onboardingDismissed;

  const displayName = displayHandle(profile, user?.email);

  const walletReady = isConnected || isDemoUser;

  const handleRefresh = () => {
    refresh();
    setHistoryTick((n) => n + 1);
  };

  usePositionReconciliation(handleRefresh);

  useEffect(() => {
    goToOpenApp('', true);
  }, []);

  useEffect(() => {
    if (user?.id) {
      recordLoginActivity(user.id);
    }
  }, [user?.id]);

  const openTrade = () => {
    setSidebarSection('trade');
    setWorkspaceView('trade');
  };

  const openHistory = (opts?: { tab?: HlBotDockTab; highlightId?: string }) => {
    setSidebarSection('history');
    setWorkspaceView('history');
    setDockTab(opts?.tab ?? 'tradeHistory');
    handleRefresh();
  };

  const requireWallet = (next: () => void) => {
    if (!walletReady) {
      open();
      return;
    }
    next();
  };

  const openDeposit = () => {
    setSidebarSection('deposit');
    if (!user && !isDemoUser) return;
    requireWallet(() => {
      setDepositTab('deposit');
      setShowDeposit(true);
    });
  };

  const openWithdraw = () => {
    setSidebarSection('withdraw');
    if (!user && !isDemoUser) return;
    requireWallet(() => {
      setDepositTab('withdraw');
      setShowDeposit(true);
    });
  };

  useEffect(() => {
    const action = searchParams.get('action');
    const view = searchParams.get('view');
    if (!action && !view) return;

    if (view === 'history') {
      openHistory();
    } else if (action === 'deposit') {
      openDeposit();
    } else if (action === 'withdraw') {
      openWithdraw();
    } else if (action === 'support') {
      setSidebarSection('support');
      setShowSupport(true);
    } else if (action === 'security') {
      navigate(`${getAppEntryPath()}?section=profile#profile-security`);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('action');
    next.delete('view');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per query change from profile nav
  }, [searchParams]);

  const portfolio = totalUsdValue + metrics.hlBalanceUsd;

  const botSetupPhase: BotSetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (metrics.isLoading || hlSetup.loading) return 'loading';
    if (hlSetup.accountUsd < MIN_BOT_CAPITAL_USD) return 'fund';
    if (!hlSetup.agentApproved) return 'approve';
    if (hlSetup.builderFeeEnabled && hlSetup.builderPlatformReady && !hlSetup.builderFeeApproved) {
      return 'approve';
    }
    return 'ready';
  }, [
    walletReady,
    metrics.isLoading,
    hlSetup.loading,
    hlSetup.agentApproved,
    hlSetup.builderFeeEnabled,
    hlSetup.builderPlatformReady,
    hlSetup.builderFeeApproved,
    hlSetup.accountUsd,
  ]);

  return (
    <Dashboard2Shell
      profile={profile}
      userId={user?.id}
      activeSection={sidebarSection}
      onTrade={openTrade}
      onProTrade={() => navigate(OPEN_APP_PATH)}
      onHistory={() => openHistory()}
      onNotifications={() => openHistory({ tab: 'tradeHistory' })}
      onDeposit={openDeposit}
      onWithdraw={openWithdraw}
      onSupport={() => {
        setSidebarSection('support');
        setShowSupport(true);
      }}
      onProfile={() => navigate(`${getAppEntryPath()}?section=profile`)}
    >
        <header className="term-market-bar">
          <div className="term-market-bar-top">
            <div className="term-welcome">
              <p className="term-welcome-greeting">
                <span className="term-welcome-hello">{greeting}</span>
                <span className="term-welcome-name">{displayName}</span>
              </p>
            </div>

            <div className="term-market-actions">
              <TermNotificationsBell
                onViewHistory={(tradeId) =>
                  openHistory({ tab: 'tradeHistory' })
                }
              />
              <button type="button" className="term-btn-sm" onClick={openDeposit}>
                <ArrowDownLeft size={14} />
                Deposit
              </button>
              <button
                type="button"
                className="term-btn-sm"
                onClick={openWithdraw}
                disabled={metrics.isLoading || metrics.hlWithdrawableUsd <= 0}
              >
                <ArrowUpRight size={14} />
                Withdraw
              </button>
              <button
                type="button"
                className="term-btn-sm"
                onClick={() => setShowBotSettings(true)}
              >
                <Settings size={14} />
                Bot settings
              </button>
              {isConnected && address ? (
                <button type="button" className="term-btn-wallet" onClick={() => open()}>
                  {shortAddr(address)}
                </button>
              ) : (
                <button
                  type="button"
                  className="term-btn-wallet term-btn-wallet--connect"
                  onClick={() => open()}
                >
                  <Wallet size={14} />
                  Connect wallet
                </button>
              )}
            </div>
          </div>

          <div className="term-market-bar-stats" role="region" aria-label="Account metrics">
            <div className="term-stats-group">
              <div className="term-stat">
                <span className="term-stat-label">Wallet</span>
                <span className="term-stat-value">
                  {metrics.isLoading ? '—' : fmtUsd(metrics.walletAvailableUsd)}
                </span>
              </div>
              <div className="term-stat">
                <span className="term-stat-label">HL balance</span>
                <span className="term-stat-value">
                  {metrics.isLoading ? '—' : fmtUsd(metrics.hlBalanceUsd)}
                </span>
              </div>
              <div className="term-stat">
                <span className="term-stat-label">Withdrawable</span>
                <span className="term-stat-value">
                  {metrics.isLoading ? '—' : fmtUsd(metrics.hlWithdrawableUsd)}
                </span>
              </div>
              <div className="term-stat">
                <span className="term-stat-label">In trade</span>
                <span className="term-stat-value">
                  {metrics.isLoading ? '—' : fmtUsd(metrics.activeTradeUsd)}
                </span>
              </div>
              <div className="term-stat">
                <span className="term-stat-label">Portfolio</span>
                <span className="term-stat-value">
                  {metrics.isLoading ? '—' : fmtUsd(portfolio)}
                </span>
              </div>
            </div>
            <div className="term-stats-group">
              <div className="term-stat">
                <span className="term-stat-label">Total P/L</span>
                <span
                  className={`term-stat-value ${
                    metrics.isLoading
                      ? ''
                      : metrics.totalPnlUsd >= 0
                        ? 'term-pnl-pos'
                        : 'term-pnl-neg'
                  }`}
                >
                  {metrics.isLoading
                    ? '—'
                    : `${metrics.totalPnlUsd >= 0 ? '+' : ''}${fmtUsd(metrics.totalPnlUsd)}`}
                </span>
              </div>
              <div className="term-stat">
                <span className="term-stat-label">Realized</span>
                <span className="term-stat-value">
                  {metrics.isLoading ? '—' : fmtUsd(metrics.realizedPnlUsd)}
                </span>
              </div>
              <div className="term-stat">
                <span className="term-stat-label">Unrealized</span>
                <span
                  className={`term-stat-value ${
                    metrics.isLoading
                      ? ''
                      : metrics.unrealizedPnlUsd >= 0
                        ? 'term-pnl-pos'
                        : 'term-pnl-neg'
                  }`}
                >
                  {metrics.isLoading
                    ? '—'
                    : `${metrics.unrealizedPnlUsd >= 0 ? '+' : ''}${fmtUsd(metrics.unrealizedPnlUsd)}`}
                </span>
              </div>
            </div>
            <div className="term-stats-group term-stats-group--solo">
              <div className="term-stat">
                <span className="term-stat-label">Win rate</span>
                <span className="term-stat-value">
                  {metrics.isLoading
                    ? '—'
                    : metrics.closedTradesCount > 0
                      ? `${metrics.winRate.toFixed(0)}%`
                      : '—'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div
          className={`term-workspace ${workspaceView === 'history' ? 'term-workspace--history' : ''}`}
        >
          {workspaceView === 'history' ? (
            <ProTradeHlBotDock
              activeTab={dockTab}
              onTabChange={setDockTab}
              refreshKey={historyTick}
              walletAddress={address ?? botSettings.wallet ?? null}
              walletConnected={walletReady}
              showBotAnalysis={false}
              botAnalysisMetrics={metrics}
              botAnalysisSymbol={chartSymbol}
              botAnalysisWallet={address ?? botSettings.wallet ?? null}
            />
          ) : (
            <>
              <div className="term-center">
                <div className="term-chart-area">
                  <div className="term-chart-inner">
                    <TradingBotPage
                      embedded
                      splitLayout="chart"
                      chartCompact={false}
                      chartFill
                      onPairChange={setChartSymbol}
                    />
                  </div>
                </div>
                <ProTradeHlBotDock
                  activeTab={dockTab}
                  onTabChange={setDockTab}
                  refreshKey={historyTick}
                  walletAddress={address ?? botSettings.wallet ?? null}
                  walletConnected={walletReady}
                  showBotAnalysis
                  botAnalysisMetrics={metrics}
                  botAnalysisSymbol={chartSymbol}
                  botAnalysisWallet={address ?? botSettings.wallet ?? null}
                  onPositionChange={handleRefresh}
                  onCoinClick={(coin) => setChartSymbol(hlCoinToBotSymbol(coin))}
                />
              </div>

              <TerminalTradePanel
                metrics={metrics}
                onRefresh={handleRefresh}
                onOpenHistory={openHistory}
                fundsAction={fundsAction}
                onFundsActionHandled={() => setFundsAction(null)}
              />
            </>
          )}
        </div>

      {showBotSettings && (
        <TerminalBotSettingsModal
          setupPhase={botSetupPhase}
          minHlUsd={MIN_BOT_CAPITAL_USD}
          settings={botSettings.settings}
          walletAddress={address ?? botSettings.wallet}
          onClose={() => setShowBotSettings(false)}
          onSuccess={() => {
            setShowBotSettings(false);
            handleRefresh();
          }}
        />
      )}
      {showDeposit && (
        <ProTradeDepositModal
          initialTab={depositTab}
          withdrawable={metrics.hlWithdrawableUsd.toFixed(2)}
          hlBalanceUsd={metrics.hlBalanceUsd}
          onClose={() => {
            setShowDeposit(false);
            setSidebarSection('trade');
            setWorkspaceView('trade');
          }}
          onSuccess={() => {
            setShowDeposit(false);
            setSidebarSection('trade');
            setWorkspaceView('trade');
            handleRefresh();
          }}
        />
      )}
      {showOnboarding && (
        <TerminalProfileOnboardingModal
          onComplete={() => setOnboardingDismissed(true)}
        />
      )}
      {showSupport && (
        <TerminalSupportModal
          onClose={() => {
            setShowSupport(false);
            setSidebarSection('trade');
            setWorkspaceView('trade');
          }}
        />
      )}
    </Dashboard2Shell>
  );
};

export default Dashboard2Page;
