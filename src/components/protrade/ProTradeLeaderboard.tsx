import React from 'react';
import { ExternalLink, Loader2, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BotPublicTradeRow } from '../../lib/api/botPublicLeaderboard';
import { useBotPublicLeaderboardData } from '../../hooks/useBotPublicLeaderboard';

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

function fmtRelative(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return t('leaderboard.justNow');
  if (mins < 60) return t('leaderboard.minsAgo', { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('leaderboard.hoursAgo', { n: hrs });
  return t('leaderboard.daysAgo', { n: Math.floor(hrs / 24) });
}

const TOP_LIMIT = 10;
const RECENT_LIMIT = 10;

function TradeTable({ trades }: { trades: BotPublicTradeRow[] }) {
  const { t } = useTranslation();
  return (
    <div className="hl-leaderboard-table-wrap">
      <table className="hl-dock-table hl-leaderboard-table">
        <thead>
          <tr>
            <th>{t('leaderboard.wallet')}</th>
            <th>{t('leaderboard.pair')}</th>
            <th>{t('leaderboard.side')}</th>
            <th className="is-hide-narrow">{t('leaderboard.opened')}</th>
            <th className="is-hide-narrow">{t('leaderboard.closed')}</th>
            <th className="is-num">{t('leaderboard.pnl')}</th>
            <th className="is-action">{t('leaderboard.verify')}</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id}>
              <td className="is-mono" title={`0x${trade.wallet.slice(2, 6)}…${trade.wallet.slice(-4)}`}>
                0x{trade.walletLabel}
              </td>
              <td>{trade.pair}</td>
              <td>
                <span
                  className={`hl-leaderboard-side hl-leaderboard-side--${trade.direction.toLowerCase()}`}
                >
                  {trade.direction}
                </span>
              </td>
              <td className="is-time is-hide-narrow">{fmtWhen(trade.openedAt)}</td>
              <td className="is-time is-hide-narrow">{fmtWhen(trade.closedAt)}</td>
              <td className="is-num hl-up">{fmtUsd(trade.profitUsd)}</td>
              <td className="is-action">
                <a
                  href={trade.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hl-leaderboard-verify"
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
}

const ProTradeLeaderboard: React.FC = () => {
  const { t } = useTranslation();
  const { topTrades, liveTrades, loading } = useBotPublicLeaderboardData({
    topLimit: TOP_LIMIT,
    recentLimit: RECENT_LIMIT,
  });

  return (
    <div className="hl-leaderboard-page">
      <header className="hl-leaderboard-hero">
        <div className="hl-leaderboard-hero__copy">
          <div className="hl-leaderboard-hero__icon" aria-hidden>
            <Trophy size={20} />
          </div>
          <div>
            <h1 className="hl-leaderboard-hero__title">{t('leaderboard.title')}</h1>
            <p className="hl-leaderboard-hero__lead">{t('leaderboard.lead')}</p>
          </div>
        </div>
      </header>

      <div className="hl-leaderboard-grid">
        <section className="hl-leaderboard-panel hl-leaderboard-panel--positions">
          <div className="hl-leaderboard-panel__head">
            <h2>{t('leaderboard.bestPositions')}</h2>
            <span>{t('leaderboard.topByPnl', { n: TOP_LIMIT })}</span>
          </div>
          {loading && topTrades.length === 0 ? (
            <div className="hl-leaderboard-state">
              <Loader2 size={20} className="animate-spin" aria-hidden />
              <span>{t('leaderboard.loading')}</span>
            </div>
          ) : topTrades.length === 0 ? (
            <p className="hl-leaderboard-empty">{t('leaderboard.emptyTop')}</p>
          ) : (
            <TradeTable trades={topTrades} />
          )}
        </section>

        <section className="hl-leaderboard-panel hl-leaderboard-panel--wins">
          <div className="hl-leaderboard-panel__head">
            <span className="hl-leaderboard-live-dot" aria-hidden />
            <h2>{t('leaderboard.topWins')}</h2>
            <span>{t('leaderboard.recentRefresh')}</span>
          </div>
          {loading && liveTrades.length === 0 ? (
            <div className="hl-leaderboard-state hl-leaderboard-state--compact">
              <Loader2 size={18} className="animate-spin" aria-hidden />
            </div>
          ) : liveTrades.length === 0 ? (
            <p className="hl-leaderboard-empty">{t('leaderboard.emptyRecent')}</p>
          ) : (
            <ul className="hl-leaderboard-live-list">
              {liveTrades.map((trade) => (
                <li key={`live-${trade.id}`} className="hl-leaderboard-live-row">
                  <div className="hl-leaderboard-live-main">
                    <span className="is-mono">0x{trade.walletLabel}</span>
                    <span>
                      {trade.pair} {trade.direction}
                    </span>
                    {trade.isLive ? (
                      <span className="hl-leaderboard-live-badge">{t('leaderboard.live')}</span>
                    ) : null}
                  </div>
                  <div className="hl-leaderboard-live-side">
                    <strong className="hl-up">{fmtUsd(trade.profitUsd)}</strong>
                    <span>{fmtRelative(trade.closedAt, t)}</span>
                    <a
                      href={trade.verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hl-leaderboard-verify"
                    >
                      {t('leaderboard.verify')}
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default ProTradeLeaderboard;
