import React, { useEffect, useMemo, useState } from 'react';
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
import Dashboard2Sidebar, {
  type Dashboard2SidebarSection,
} from '../../components/dashboard2/Dashboard2Sidebar';
import TerminalProfileModal from '../../components/terminal/TerminalProfileModal';
import TerminalBotSettingsModal from '../../components/terminal/TerminalBotSettingsModal';
import TerminalDepositModal from '../../components/terminal/TerminalDepositModal';
import TerminalWithdrawModal from '../../components/terminal/TerminalWithdrawModal';
import TerminalSupportModal from '../../components/terminal/TerminalSupportModal';
import TerminalSecurityModal from '../../components/terminal/TerminalSecurityModal';
import type { BotSetupPhase } from '../../components/terminal/TerminalBotSettingsModal';

const MIN_VAULT_USD = 50;

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type WorkspaceView = 'trade' | 'history';

const Dashboard2Page: React.FC = () => {
  const { profile, user, isDemoUser } = useAuth();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { totalUsdValue } = useWeb3();
  const { metrics, refresh } = useDashboard2Metrics();
  const { greeting } = useUserLocale();

  const [vaultAction, setVaultAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [showProfile, setShowProfile] = useState(false);
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [sidebarSection, setSidebarSection] = useState<Dashboard2SidebarSection>('trade');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('trade');
  const [dockTab, setDockTab] = useState<DockTab>('open');

  const vault = useTerminalVaultData(historyTick);

  const displayName =
    profile?.full_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Trader';

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
  });

  const openTrade = () => {
    setSidebarSection('trade');
    setWorkspaceView('trade');
  };

  const openHistory = () => {
    setSidebarSection('history');
    setWorkspaceView('history');
    setDockTab('all');
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
    requireWallet(() => setShowDeposit(true));
  };

  const openWithdraw = () => {
    setSidebarSection('withdraw');
    requireWallet(() => setShowWithdraw(true));
  };

  const portfolio = totalUsdValue + metrics.vaultUsd;

  const botSetupPhase: BotSetupPhase = useMemo(() => {
    if (!walletReady) return 'connect';
    if (metrics.isLoading || vault.isLoading) return 'loading';
    if (!vault.onArbitrum) return 'network';
    if (vault.vaultUsd < MIN_VAULT_USD) return 'fund';
    return 'ready';
  }, [walletReady, metrics.isLoading, vault.isLoading, vault.onArbitrum, vault.vaultUsd]);

  return (
    <div className="term-root">
      <Dashboard2Sidebar
        profile={profile}
        userId={user?.id}
        activeSection={sidebarSection}
        onTrade={openTrade}
        onHistory={openHistory}
        onDeposit={openDeposit}
        onWithdraw={openWithdraw}
        onSupport={() => {
          setSidebarSection('support');
          setShowSupport(true);
        }}
        onSecurity={() => {
          setSidebarSection('security');
          setShowSecurity(true);
        }}
        onProfile={() => {
          setSidebarSection('profile');
          setShowProfile(true);
        }}
      />

      <div className="term-main">
        <header className="term-market-bar">
          <div className="term-market-bar-top">
            <div className="term-welcome">
              <p className="term-welcome-greeting">
                <span className="term-welcome-hello">{greeting}</span>
                <span className="term-welcome-name">{displayName}</span>
              </p>
            </div>

            <div className="term-market-actions">
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
            />
          ) : (
            <>
              <div className="term-center">
                <div className="term-chart-area">
                  <div className="term-chart-inner">
                    <TradingBotPage embedded splitLayout="chart" chartCompact={false} chartFill />
                    <TerminalChartAnalysisOverlay
                      visible={walletReady}
                      scanning={analysis.scanning}
                      step={analysis.step}
                      progress={analysis.progress}
                      isLoading={analysis.isLoading}
                      signal={analysis.signal}
                      dbAnalysis={analysis.dbAnalysis}
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
      </div>

      {showProfile && (
        <TerminalProfileModal
          onClose={() => {
            setShowProfile(false);
            setSidebarSection('trade');
            setWorkspaceView('trade');
          }}
        />
      )}
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
      {showWithdraw && (
        <TerminalWithdrawModal
          maxAmount={vault.vaultUsd.toFixed(2)}
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
      {showSecurity && (
        <TerminalSecurityModal
          onClose={() => {
            setShowSecurity(false);
            setSidebarSection('trade');
            setWorkspaceView('trade');
          }}
        />
      )}
    </div>
  );
};

export default Dashboard2Page;
