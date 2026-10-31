import React from 'react';
import type { TradingDashboardMetrics } from '../../hooks/useTradingDashboardMetrics';

type PnlRowProps = {
  label: string;
  value: number;
  loading?: boolean;
};

function MiniSparkline({ positive }: { positive: boolean }) {
  const stroke = positive ? '#16a34a' : '#dc2626';
  const path = positive
    ? 'M0 24 L8 18 L16 20 L24 12 L32 14 L40 6 L48 8'
    : 'M0 8 L8 14 L16 12 L24 18 L32 16 L40 22 L48 20';
  return (
    <svg viewBox="0 0 48 28" className="h-10 w-20 shrink-0" aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PnlRow({ label, value, loading }: PnlRowProps) {
  const positive = value >= 0;
  return (
    <div className="terminal-pnl-row">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-[#71717a]">{label}</p>
        {loading ? (
          <div className="mt-2 h-7 w-24 rounded bg-black/[0.06] animate-pulse" />
        ) : (
          <p
            className={`mt-1 font-display text-xl font-semibold tracking-tight ${
              positive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {positive ? '+' : ''}${Math.abs(value).toFixed(2)}
          </p>
        )}
      </div>
      {!loading && <MiniSparkline positive={positive} />}
    </div>
  );
}

type TradingPnlSidebarProps = {
  metrics: TradingDashboardMetrics;
  onOpenSettings?: () => void;
};

const TradingPnlSidebar: React.FC<TradingPnlSidebarProps> = ({ metrics, onOpenSettings }) => {
  return (
    <aside className="terminal-pnl-sidebar">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#0a0a0a]">P/L overview</h3>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[11px] font-medium text-[#52525b] hover:text-[#0a0a0a] underline"
          >
            Bot settings
          </button>
        )}
      </div>

      <div className="space-y-4">
        <PnlRow label="Total P/L" value={metrics.totalPnl} loading={metrics.isLoading} />
        <PnlRow label="24 hour" value={metrics.pnl24h} loading={metrics.isLoading} />
        <PnlRow label="7 day" value={metrics.pnl7d} loading={metrics.isLoading} />
        <PnlRow label="30 day" value={metrics.pnl30d} loading={metrics.isLoading} />
      </div>

      <div className="mt-6 pt-4 border-t border-[#e4e4e8] space-y-2 text-xs text-[#52525b]">
        <div className="flex justify-between">
          <span>Win rate (closed)</span>
          <span className="font-medium text-[#0a0a0a]">
            {metrics.isLoading ? '—' : `${metrics.winRate.toFixed(1)}%`}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Auto-trading</span>
          <span
            className={`font-medium ${metrics.autoTradeEnabled ? 'text-green-600' : 'text-[#71717a]'}`}
          >
            {metrics.autoTradeEnabled ? 'Active' : 'Off'}
          </span>
        </div>
      </div>
    </aside>
  );
};

export default TradingPnlSidebar;
