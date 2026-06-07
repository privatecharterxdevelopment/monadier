import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wallet, ArrowDownLeft, ArrowUpRight, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { useUserLocale } from '../../hooks/useUserLocale';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useDashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { usePositionReconciliation } from '../../hooks/usePositionReconciliation';
import { useTerminalVaultData } from '../../hooks/useTerminalVaultData';
import { recordLoginActivity } from '../../lib/loginActivity';
import TerminalChartAnalysisOverlay from '../../components/terminal/TerminalChartAnalysisOverlay';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import TerminalTradePanel from '../../components/terminal/TerminalTradePanel';
import TerminalPositionsDock, {
  type DockTab,
} from '../../components/terminal/TerminalPositionsDock';
import TradingBotPage from './TradingBotPage';
import Dashboard2Shell from '../../components/dashboard2/Dashboard2Shell';
import type { Dashboard2SidebarSection } from '../../components/dashboard2/Dashboard2Sidebar';
import TerminalBotSettingsModal from '../../components/terminal/TerminalBotSettingsModal';
import TerminalDepositModal from '../../components/terminal/TerminalDepositModal';
import TerminalWithdrawModal from '../../components/terminal/TerminalWithdrawModal';
import TerminalSupportModal from '../../components/terminal/TerminalSupportModal';
import TermNotificationsBell from '../../components/terminal/TermNotificationsBell';
import { getAppEntryPath } from '../../lib/appUrls';
import TerminalProfileOnboardingModal from '../../components/terminal/TerminalProfileOnboardingModal';
import TerminalArbitrumBanner from '../../components/terminal/TerminalArbitrumBanner';
import type { BotSetupPhase } from '../../components/terminal/TerminalBotSettingsModal';
import { displayHandle } from '../../lib/username';
import { useProfileOnboarding } from '../../hooks/useProfileOnboarding';

const MIN_VAULT_USD = 50;

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

  const [vaultAction, setVaultAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [sidebarSection, setSidebarSection] = useState<Dashboard2SidebarSection>('trade');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('trade');
  const [dockTab, setDockTab] = useState<DockTab>('open');
  const [highlightPositionId, setHighlightPositionId] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState('ETHUSDT');

  const vault = useTerminalVaultData(historyTick);
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
  const hasOpenPosition =
    metrics.openPositionsCount > 0 || Boolean(vault.position?.isActive);

  const handleRefresh = () => {
    refresh();
    setHistoryTick((n) => n + 1);
  };

  usePositionReconciliation(handleRefresh);

  useEffect(() => {
    if (user?.id) {
      recordLoginActivity(user.id);
    }
  }, [user?.id]);

  const analysis = useTerminalBotAnalysis({
    walletConnected: walletReady,
    metrics,
    hasOpenPosition,
    symbol: chartSymbol,
  });

  const openTrade = () => {
    setSidebarSection('trade');
    setWorkspaceView('trade');
  };

  const openHistory = (opts?: { tab?: DockTab; highlightId?: string }) => {
    setSidebarSection('history');
    setWorkspaceView('history');
    setDockTab(opts?.tab ?? 'all');
    setHighlightPositionId(opts?.highlightId ?? null);
    handleRefresh();
    if (opts?.highlightId) {
      window.setTimeout(() => setHighlightPositionId(null), 4500);
    }
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
    requireWallet(() => setShowDeposit(true));
  };

  const openWithdraw = () => {
    setSidebarSection('withdraw');
    requireWallet(() => setShowWithdraw(true));
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

  const portfolio = totalUsdValue + metrics.vaultUsd;

  const botSetupPhase: BotSetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (metrics.isLoading || vault.isLoading) return 'loading';
    if (!vault.onArbitrum) return 'network';
    if (vault.vaultUsd < MIN_VAULT_USD) return 'fund';
    return 'ready';
  }, [walletReady, metrics.isLoading, vault.isLoading, vault.onArbitrum, vault.vaultUsd]);

  return (
    <Dashboard2Shell
      profile={profile}
      userId={user?.id}
      activeSection={sidebarSection}
      onTrade={openTrade}
      onProTrade={() => navigate('/dashboard2/pro')}
      onHistory={() => openHistory()}
      onNotifications={() => openHistory({ tab: 'history' })}
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
                  openHistory({ tab: 'history', highlightId: tradeId })
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
                disabled={metrics.isLoading || metrics.vaultUsd <= 0}
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

          {walletReady && !vault.onArbitrum && <TerminalArbitrumBanner />}

          <div className="term-market-bar-stats" role="region" aria-label="Account metrics">
            <div className="term-stats-group">
              <div className="term-stat">
                <span className="term-stat-label">Wallet</span>
                <span className="term-stat-value">
                  {metrics.isLoading ? '—' : fmtUsd(metrics.walletAvailableUsd)}
                </span>
              </div>
              <div className="term-stat">
                <span className="term-stat-label">Vault</span>
                <span className="term-stat-value">
                  {metrics.isLoading ? '—' : fmtUsd(metrics.vaultUsd)}
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
            <TerminalPositionsDock
              id="term-history-page"
              layout="page"
              refreshKey={historyTick}
              botRunning={metrics.autoTradeEnabled}
              activeTab={dockTab}
              onTabChange={setDockTab}
              highlightPositionId={highlightPositionId}
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
                    <TerminalChartAnalysisOverlay
                      visible={walletReady}
                      scanning={analysis.scanning}
                      step={analysis.step}
                      progress={analysis.progress}
                      isLoading={analysis.isLoading}
                      signal={analysis.signal}
                      dbAnalysis={analysis.dbAnalysis}
                      activeSymbol={analysis.activeSymbol}
                    />
                  </div>
                </div>
                <TerminalPositionsDock
                  id="term-history-dock"
                  refreshKey={historyTick}
                  botRunning={metrics.autoTradeEnabled}
                  activeTab={dockTab}
                  onTabChange={setDockTab}
                />
              </div>

              <TerminalTradePanel
                metrics={metrics}
                onRefresh={handleRefresh}
                onOpenHistory={openHistory}
                vaultAction={vaultAction}
                onVaultActionHandled={() => setVaultAction(null)}
              />
            </>
          )}
        </div>

      {showBotSettings && (
        <TerminalBotSettingsModal
          setupPhase={botSetupPhase}
          minVaultUsd={MIN_VAULT_USD}
          currentRiskLevel={vault.settings.riskPct}
          autoTradeEnabled={metrics.autoTradeEnabled}
          currentTakeProfit={vault.settings.takeProfit}
          currentStopLoss={vault.settings.stopLoss}
          currentLeverage={vault.settings.leverage}
          currentAskPermission={vault.settings.askPermission}
          currentMinWinRate={vault.settings.minWinRate}
          currentMinTradesForWinRate={vault.settings.minTradesForWinRate}
          onClose={() => setShowBotSettings(false)}
          onSuccess={() => {
            setShowBotSettings(false);
            handleRefresh();
          }}
        />
      )}
      {showDeposit && (
        <TerminalDepositModal
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
      {showWithdraw && (
        <TerminalWithdrawModal
          maxAmount={vault.vaultUsd.toFixed(2)}
          balanceAmount={vault.balanceUsd.toFixed(2)}
          hasActivePosition={hasOpenPosition}
          onClose={() => {
            setShowWithdraw(false);
            setSidebarSection('trade');
            setWorkspaceView('trade');
          }}
          onSuccess={() => {
            setShowWithdraw(false);
            setSidebarSection('trade');
            setWorkspaceView('trade');
            handleRefresh();
          }}
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
