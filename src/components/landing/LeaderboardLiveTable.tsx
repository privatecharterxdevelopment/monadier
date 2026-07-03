import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useBotPublicLiveWins } from '../../hooks/useBotPublicLeaderboard';

function fmtUsd(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Props = {
  limit?: number;
  emptyMessage?: string;
  loadingMessage?: string;
  className?: string;
};

const LeaderboardLiveTable: React.FC<Props> = ({
  limit = 12,
  emptyMessage = 'No recent wins yet.',
  loadingMessage = 'Loading verified trades…',
  className = '',
}) => {
  const { rows, loading } = useBotPublicLiveWins(limit);

  if (loading && rows.length === 0) {
    return <p className="landing-leaderboard-table-empty">{loadingMessage}</p>;
  }

  if (rows.length === 0) {
    return <p className="landing-leaderboard-table-empty">{emptyMessage}</p>;
  }

  return (
    <div className={`landing-leaderboard-table-wrap ${className}`.trim()}>
      <table className="landing-leaderboard-table">
        <thead>
          <tr>
            <th scope="col">Wallet</th>
            <th scope="col">Pair</th>
            <th scope="col">Opened</th>
            <th scope="col">Closed</th>
            <th scope="col" className="is-num">
              P/L
            </th>
            <th scope="col" className="is-action">
              Verify
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((trade) => (
            <tr key={trade.id}>
              <td className="is-mono">
                0x{trade.walletLabel}
                {trade.isLive ? (
                  <span className="landing-leaderboard-live-pill" aria-label="Recent win">
                    live
                  </span>
                ) : null}
              </td>
              <td>
                {trade.pair}{' '}
                <span
                  className={`landing-leaderboard-side landing-leaderboard-side--${trade.direction.toLowerCase()}`}
                >
                  {trade.direction}
                </span>
              </td>
              <td className="is-time">{fmtWhen(trade.openedAt)}</td>
              <td className="is-time">{fmtWhen(trade.closedAt)}</td>
              <td className="is-num is-profit">{fmtUsd(trade.profitUsd)}</td>
              <td className="is-action">
                <a
                  href={trade.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-leaderboard-verify"
                >
                  HypurrScan
                  <ExternalLink size={12} aria-hidden />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LeaderboardLiveTable;
