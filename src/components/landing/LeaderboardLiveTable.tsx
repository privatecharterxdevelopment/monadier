import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBotPublicRecentCloses } from '../../hooks/useBotPublicLeaderboard';

function fmtUsd(n: number): string {
  const sign = n >= 0 ? '+' : '−';
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
  emptyMessage,
  loadingMessage,
  className = '',
}) => {
  const { t } = useTranslation();
  const { rows, loading } = useBotPublicRecentCloses(limit);
  const empty = emptyMessage ?? t('leaderboard.emptyAll');
  const loadingMsg = loadingMessage ?? t('leaderboard.loading');

  if (loading && rows.length === 0) {
    return <p className="landing-leaderboard-table-empty">{loadingMsg}</p>;
  }

  if (rows.length === 0) {
    return <p className="landing-leaderboard-table-empty">{empty}</p>;
  }

  return (
    <div className={`landing-leaderboard-table-wrap ${className}`.trim()}>
      <table className="landing-leaderboard-table">
        <thead>
          <tr>
            <th scope="col">{t('leaderboard.wallet')}</th>
            <th scope="col">{t('leaderboard.pair')}</th>
            <th scope="col">{t('leaderboard.opened')}</th>
            <th scope="col">{t('leaderboard.closed')}</th>
            <th scope="col" className="is-num">
              {t('leaderboard.pnl')}
            </th>
            <th scope="col" className="is-action">
              {t('leaderboard.verify')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((trade) => (
            <tr key={trade.id}>
              <td className="is-mono">
                0x{trade.walletLabel}
                {trade.isLive ? (
                  <span className="landing-leaderboard-live-pill" aria-label={t('leaderboard.live')}>
                    {t('leaderboard.live')}
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
              <td className={`is-num ${trade.profitUsd >= 0 ? 'is-profit' : 'is-loss'}`}>
                {fmtUsd(trade.profitUsd)}
              </td>
              <td className="is-action">
                <a
                  href={trade.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-leaderboard-verify"
                >
                  {t('leaderboard.hypurrScan')}
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
