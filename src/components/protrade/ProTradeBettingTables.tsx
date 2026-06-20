import React from 'react';
import { Loader2 } from 'lucide-react';
import { fmtClosedPnl, fmtUsdSymbol, fmtTimeMs } from '../../lib/hyperliquid/format';
import type { HlBettingCloseRow, HlBettingPositionRow } from '../../lib/betting/types';

type Props = {
  openBets: HlBettingPositionRow[];
  closedBets: HlBettingCloseRow[];
  loading?: boolean;
  syncing?: boolean;
  signedIn?: boolean;
  compact?: boolean;
  showSummary?: boolean;
  summary?: {
    openStake: number;
    openUpnl: number;
    realizedPnl: number;
    wins: number;
    losses: number;
  };
  onNavigateBetting?: () => void;
};

const ProTradeBettingTables: React.FC<Props> = ({
  openBets,
  closedBets,
  loading,
  syncing,
  signedIn = true,
  compact = false,
  showSummary = false,
  summary,
  onNavigateBetting,
}) => {
  if (!signedIn) {
    return (
      <p className="hl-portfolio-empty">
        Sign in to save and view your betting history across devices.
      </p>
    );
  }

  return (
    <div className={`hl-betting-portfolio ${compact ? 'hl-betting-portfolio--compact' : ''}`}>
      {showSummary && summary ? (
        <div className="hl-betting-summary">
          <div className="hl-betting-summary-card">
            <span className="hl-betting-summary-label">Open stake</span>
            <span className="hl-betting-summary-value">{fmtUsdSymbol(summary.openStake)}</span>
          </div>
          <div className="hl-betting-summary-card">
            <span className="hl-betting-summary-label">Open uPnL</span>
            <span
              className={`hl-betting-summary-value ${summary.openUpnl >= 0 ? 'hl-up' : 'hl-down'}`}
            >
              {fmtClosedPnl(summary.openUpnl)}
            </span>
          </div>
          <div className="hl-betting-summary-card">
            <span className="hl-betting-summary-label">Realized P/L</span>
            <span
              className={`hl-betting-summary-value ${summary.realizedPnl >= 0 ? 'hl-up' : 'hl-down'}`}
            >
              {fmtClosedPnl(summary.realizedPnl)}
            </span>
          </div>
          <div className="hl-betting-summary-card">
            <span className="hl-betting-summary-label">W / L</span>
            <span className="hl-betting-summary-value">
              {summary.wins} / {summary.losses}
            </span>
          </div>
        </div>
      ) : null}

      {(loading || syncing) && openBets.length === 0 && closedBets.length === 0 ? (
        <Loader2 size={20} className="animate-spin" style={{ margin: '16px auto' }} />
      ) : null}

      <div className="hl-portfolio-section">
        <div className="hl-betting-section-head">
          <h3 className="hl-portfolio-heading">Open bets</h3>
          {syncing ? <span className="hl-betting-sync-badge">Syncing…</span> : null}
        </div>
        {openBets.length === 0 ? (
          <p className="hl-portfolio-empty">
            No open bets.{' '}
            {onNavigateBetting ? (
              <button type="button" className="hl-coin-link" onClick={onNavigateBetting}>
                Go to Betting
              </button>
            ) : null}
          </p>
        ) : (
          <table className="hl-dock-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Side</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>Stake</th>
                <th>uPnL</th>
              </tr>
            </thead>
            <tbody>
              {openBets.map((b) => (
                <tr key={b.id}>
                  <td>{b.market_name}</td>
                  <td>{b.side_label}</td>
                  <td>{Math.floor(b.size)}</td>
                  <td>{b.entry_px.toFixed(4)}</td>
                  <td>{b.mark_px != null ? b.mark_px.toFixed(4) : '—'}</td>
                  <td>{fmtUsdSymbol(b.entry_ntl)}</td>
                  <td className={(b.unrealized_pnl ?? 0) >= 0 ? 'hl-up' : 'hl-down'}>
                    {fmtClosedPnl(b.unrealized_pnl ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="hl-portfolio-section">
        <h3 className="hl-portfolio-heading">Closed bets</h3>
        {closedBets.length === 0 ? (
          <p className="hl-portfolio-empty">No settled bets yet.</p>
        ) : (
          <table className="hl-dock-table">
            <thead>
              <tr>
                <th>Closed</th>
                <th>Market</th>
                <th>Side</th>
                <th>Size</th>
                <th>Exit</th>
                <th>P/L</th>
              </tr>
            </thead>
            <tbody>
              {closedBets.map((b) => (
                <tr key={b.id}>
                  <td>{fmtTimeMs(Date.parse(b.closed_at))}</td>
                  <td>{b.market_name}</td>
                  <td>{b.side_label}</td>
                  <td>{Math.floor(b.size)}</td>
                  <td>{b.exit_px.toFixed(4)}</td>
                  <td className={b.realized_pnl >= 0 ? 'hl-up' : 'hl-down'}>
                    {fmtClosedPnl(b.realized_pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ProTradeBettingTables;
