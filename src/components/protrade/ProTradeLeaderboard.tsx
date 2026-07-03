import React from 'react';
import { ExternalLink, Loader2, Trophy } from 'lucide-react';
import type { BotPublicTradeRow } from '../../lib/api/botPublicLeaderboard';
import { useBotPublicLeaderboardData } from '../../hooks/useBotPublicLeaderboard';
import ProTradePageShell from './ProTradePageShell';

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

function fmtRelative(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TOP_LIMIT = 10;
const RECENT_LIMIT = 10;

function TradeTable({ trades }: { trades: BotPublicTradeRow[] }) {
  return (
    <div className="hl-leaderboard-table-wrap">
      <table className="hl-dock-table hl-leaderboard-table">
        <thead>
          <tr>
            <th>Wallet</th>
            <th>Pair</th>
            <th>Side</th>
            <th className="is-hide-narrow">Opened</th>
            <th className="is-hide-narrow">Closed</th>
            <th className="is-num">P/L</th>
            <th className="is-action">Verify</th>
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
}

const ProTradeLeaderboard: React.FC = () => {
  const { topTrades, liveTrades, loading } = useBotPublicLeaderboardData({
    topLimit: TOP_LIMIT,
    recentLimit: RECENT_LIMIT,
  });

  return (
    <ProTradePageShell className="hl-leaderboard-page">
      <header className="hl-leaderboard-hero">
        <div className="hl-leaderboard-hero__icon" aria-hidden>
          <Trophy size={20} />
        </div>
        <div>
          <h1 className="hl-leaderboard-hero__title">Leaderboard</h1>
          <p className="hl-leaderboard-hero__lead">
            Real Hyperliquid bot wins from our users — wallet masked, verify every close on HypurrScan.
          </p>
        </div>
      </header>

      <div className="hl-leaderboard-grid">
        <section className="hl-leaderboard-panel hl-leaderboard-panel--positions">
          <div className="hl-leaderboard-panel__head">
            <h2>Best positions</h2>
            <span>Top {TOP_LIMIT} by P/L · HypurrScan</span>
          </div>
          {loading && topTrades.length === 0 ? (
            <div className="hl-leaderboard-state">
              <Loader2 size={20} className="animate-spin" aria-hidden />
              <span>Loading verified trades…</span>
            </div>
          ) : topTrades.length === 0 ? (
            <p className="hl-leaderboard-empty">
              Profitable bot closes will appear here once users start winning — all verifiable on HypurrScan.
            </p>
          ) : (
            <TradeTable trades={topTrades} />
          )}
        </section>

        <section className="hl-leaderboard-panel hl-leaderboard-panel--wins">
          <div className="hl-leaderboard-panel__head">
            <span className="hl-leaderboard-live-dot" aria-hidden />
            <h2>Top wins</h2>
            <span>Recent · 10s refresh · live HL</span>
          </div>
          {loading && liveTrades.length === 0 ? (
            <div className="hl-leaderboard-state hl-leaderboard-state--compact">
              <Loader2 size={18} className="animate-spin" aria-hidden />
            </div>
          ) : liveTrades.length === 0 ? (
            <p className="hl-leaderboard-empty">No recent wins yet.</p>
          ) : (
            <ul className="hl-leaderboard-live-list">
              {liveTrades.map((trade) => (
                <li key={`live-${trade.id}`} className="hl-leaderboard-live-row">
                  <div className="hl-leaderboard-live-main">
                    <span className="is-mono">0x{trade.walletLabel}</span>
                    <span>
                      {trade.pair} {trade.direction}
                    </span>
                    {trade.isLive ? <span className="hl-leaderboard-live-badge">LIVE</span> : null}
                  </div>
                  <div className="hl-leaderboard-live-side">
                    <strong className="hl-up">{fmtUsd(trade.profitUsd)}</strong>
                    <span>{fmtRelative(trade.closedAt)}</span>
                    <a
                      href={trade.verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hl-leaderboard-verify"
                    >
                      Verify
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ProTradePageShell>
  );
};

export default ProTradeLeaderboard;
