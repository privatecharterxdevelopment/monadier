import React, { useState } from 'react';
import { Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { useUserLocale } from '../../hooks/useUserLocale';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useDashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { usePositionReconciliation } from '../../hooks/usePositionReconciliation';
import TerminalTradePanel from '../../components/terminal/TerminalTradePanel';
import TerminalPositionsDock from '../../components/terminal/TerminalPositionsDock';
import TradingBotPage from './TradingBotPage';
import ProfileAvatar from '../../components/profile/ProfileAvatar';
import Dashboard2Sidebar from '../../components/dashboard2/Dashboard2Sidebar';
import TerminalProfileModal from '../../components/terminal/TerminalProfileModal';

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const Dashboard2Page: React.FC = () => {
  const { profile, user } = useAuth();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { totalUsdValue } = useWeb3();
  const { metrics, refresh } = useDashboard2Metrics();
  const { greeting } = useUserLocale();

  const displayName =
    profile?.full_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Trader';
  const [vaultAction, setVaultAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [showProfile, setShowProfile] = useState(false);

  const handleRefresh = () => {
    refresh();
    setHistoryTick((n) => n + 1);
  };

  usePositionReconciliation(handleRefresh);

  const scrollToHistory = () => {
    document.getElementById('term-history-dock')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const portfolio = totalUsdValue + metrics.vaultUsd;

  return (
    <div className="term-root">
      <Dashboard2Sidebar
        onDeposit={() => setVaultAction('deposit')}
        onWithdraw={() => setVaultAction('withdraw')}
        onHistory={scrollToHistory}
        onProfile={() => setShowProfile(true)}
      />

      <div className="term-main">
        <header className="term-market-bar">
          <div className="term-market-bar-top">
            <div className="term-welcome">
              <div className="term-welcome-row">
                <button
                  type="button"
                  className="term-welcome-avatar-btn"
                  onClick={() => setShowProfile(true)}
                  title="Edit profile"
                >
                  <ProfileAvatar profile={profile} userId={user?.id} size="lg" />
                </button>
                <div className="term-welcome-text">
                  <p className="term-welcome-greeting">
                    <span className="term-welcome-hello">{greeting}</span>
                    <span className="term-welcome-name">{displayName}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="term-market-actions">
              <button
                type="button"
                className="term-btn-sm"
                onClick={() => setVaultAction('deposit')}
              >
                <ArrowDownLeft size={14} />
                Deposit
              </button>
              <button
                type="button"
                className="term-btn-sm"
                onClick={() => setVaultAction('withdraw')}
                disabled={metrics.isLoading || metrics.vaultUsd <= 0}
              >
                <ArrowUpRight size={14} />
                Withdraw
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

          <div className="term-market-bar-stats">
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
            <div className="term-stat">
              <span className="term-stat-label">Profit</span>
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
          </div>
        </header>

        <div className="term-workspace">
          <div className="term-center">
            <div className="term-chart-area">
              <div className="term-chart-inner">
                <TradingBotPage embedded splitLayout="chart" chartCompact={false} chartFill />
              </div>
            </div>
            <TerminalPositionsDock
              id="term-history-dock"
              refreshKey={historyTick}
              botRunning={metrics.autoTradeEnabled}
            />
          </div>

          <TerminalTradePanel
            metrics={metrics}
            onRefresh={handleRefresh}
            onOpenHistory={scrollToHistory}
            vaultAction={vaultAction}
            onVaultActionHandled={() => setVaultAction(null)}
          />
        </div>
      </div>

      {showProfile && <TerminalProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
};

export default Dashboard2Page;
