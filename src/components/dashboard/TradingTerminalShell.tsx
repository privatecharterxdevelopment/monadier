import React from 'react';
import { RefreshCw, Settings, Search } from 'lucide-react';
import type { TradingDashboardMetrics } from '../../hooks/useTradingDashboardMetrics';
import TradingPnlSidebar from './TradingPnlSidebar';

export type TerminalTabId = 'open' | 'closed' | 'chart' | 'all';

export type TerminalTab = {
  id: TerminalTabId;
  label: string;
  badge?: number;
};

export type TerminalTabIdGeneral = string;

export type TerminalTabGeneral = {
  id: TerminalTabIdGeneral;
  label: string;
  badge?: number;
};

type TradingTerminalShellProps = {
  metrics: TradingDashboardMetrics;
  tabs: TerminalTabGeneral[];
  activeTab: TerminalTabIdGeneral;
  onTabChange: (id: TerminalTabIdGeneral) => void;
  onRefresh?: () => void;
  onOpenSettings?: () => void;
  primary: React.ReactNode;
  footer?: React.ReactNode;
  hidePnlSidebar?: boolean;
  /** Header title in dark metrics bar */
  headerTitle?: string;
  /** Overview uses wallet + account totals in header */
  variant?: 'trading' | 'overview';
  /** Wallet USD for overview center metric */
  walletUsd?: number;
  planLabel?: string;
};

function formatUsd(n: number, compact = false) {
  if (compact && Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TradingTerminalShell: React.FC<TradingTerminalShellProps> = ({
  metrics,
  tabs,
  activeTab,
  onTabChange,
  onRefresh,
  onOpenSettings,
  primary,
  footer,
  hidePnlSidebar = false,
  headerTitle = 'Trading',
  variant = 'trading',
  walletUsd = 0,
  planLabel = 'Free',
}) => {
  const accountTotal = walletUsd + metrics.vaultBalanceUsd;
  const isOverview = variant === 'overview';

  return (
    <div className="trading-terminal -mx-1 md:-mx-0">
      <header className="terminal-metrics-bar">
        <div className="flex items-center justify-between gap-4 mb-6">
          <span className="font-display text-lg font-semibold tracking-tight text-white/95">
            {headerTitle}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="terminal-metrics-btn p-2"
              aria-label="Search"
              title="Search (coming soon)"
            >
              <Search size={16} />
            </button>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="terminal-metrics-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              >
                <RefreshCw size={14} className={metrics.isLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="terminal-metrics-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              >
                <Settings size={14} />
                Settings
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <div>
            <p className="terminal-metric-label">
              {isOverview ? 'Open position value' : 'Open position value'}
            </p>
            <p className="terminal-metric-value">
              {metrics.isLoading ? '—' : formatUsd(metrics.openPositionValueUsd, true)}
            </p>
            <p className="terminal-metric-sub">
              Positions — {metrics.isLoading ? '…' : metrics.openPositionsCount}
            </p>
            <p className="terminal-metric-sub">
              Leverage — {metrics.isLoading ? '…' : `${metrics.avgLeverage.toFixed(2)}x`}
            </p>
          </div>

          <div className="md:text-center">
            <p className="terminal-metric-label">
              {isOverview ? 'Account total value' : 'HL balance'}
            </p>
            <p className="terminal-metric-value">
              {metrics.isLoading
                ? '—'
                : formatUsd(isOverview ? accountTotal : metrics.vaultBalanceUsd, true)}
            </p>
            {isOverview ? (
              <>
                <p className="terminal-metric-sub">
                  Wallet — {formatUsd(walletUsd, true)}
                </p>
                <p className="terminal-metric-sub">
                  HL — {formatUsd(metrics.vaultBalanceUsd, true)}
                </p>
              </>
            ) : (
              <>
                <p className="terminal-metric-sub">USDC · Hyperliquid perps</p>
                <p className="terminal-metric-sub">
                  Withdrawable —{' '}
                  {metrics.isLoading ? '…' : formatUsd(metrics.withdrawableUsd)}
                </p>
                <p className="terminal-metric-sub">
                  Total P/L —{' '}
                  <span className={metrics.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {metrics.isLoading
                      ? '…'
                      : `${metrics.totalPnl >= 0 ? '+' : ''}${formatUsd(metrics.totalPnl)}`}
                  </span>
                </p>
              </>
            )}
          </div>

          <div className="md:text-right">
            <p className="terminal-metric-label">
              {isOverview ? 'Available margin' : 'Available to withdraw'}
            </p>
            <p className="terminal-metric-value">
              {metrics.isLoading ? '—' : formatUsd(isOverview ? walletUsd : metrics.withdrawableUsd, true)}
            </p>
            <p className="terminal-metric-sub">
              {isOverview ? `Plan — ${planLabel}` : `Auto-trade — ${metrics.autoTradeEnabled ? 'On' : 'Off'}`}
            </p>
            <p className="terminal-metric-sub">
              {isOverview
                ? `Win rate — ${metrics.isLoading ? '…' : `${metrics.winRate.toFixed(1)}%`}`
                : `Win rate — ${metrics.isLoading ? '…' : `${metrics.winRate.toFixed(1)}%`}`}
            </p>
          </div>
        </div>
      </header>

      {/* Main white glass card */}
      <div className="terminal-main-card">
        <div
          className={
            hidePnlSidebar
              ? 'terminal-primary min-w-0'
              : 'grid grid-cols-1 xl:grid-cols-[1fr_minmax(260px,300px)] gap-6'
          }
        >
          <div className="terminal-primary min-w-0">{primary}</div>
          {!hidePnlSidebar && (
            <TradingPnlSidebar metrics={metrics} onOpenSettings={onOpenSettings} />
          )}
        </div>

        {footer && <div className="terminal-footer mt-6 pt-6 border-t border-[#e4e4e8]">{footer}</div>}

        <nav className="terminal-tabs mt-6" aria-label="Trading sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`terminal-tab ${activeTab === tab.id ? 'terminal-tab--active' : ''}`}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-1.5 text-[10px] opacity-80">({tab.badge})</span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default TradingTerminalShell;
