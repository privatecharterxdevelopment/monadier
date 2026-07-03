import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { useBotPublicLeaderboardData } from '../../hooks/useBotPublicLeaderboard';
import { BOT_PAGE_LEADERBOARD } from '../../lib/seo/tradingBotContent';

const REFRESH_MS = 10_000;

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

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const BotPublicLeaderboard: React.FC = () => {
  const { topTrades, liveTrades, loading } = useBotPublicLeaderboardData({
    topLimit: 8,
    recentLimit: 6,
    refreshMs: REFRESH_MS,
  });

  const showTop = topTrades.length > 0;
  const showLive = liveTrades.length > 0;

  return (
    <section
      className="landing-gmx-gutter landing-bot-leaderboard-section"
      aria-labelledby="bot-leaderboard-title"
    >
      <div className="landing-gmx-shell landing-bot-leaderboard-shell">
        <motion.div {...fadeUp(0)} className="landing-bot-leaderboard-head">
          <p className="landing-bot-leaderboard-eyebrow">{BOT_PAGE_LEADERBOARD.eyebrow}</p>
          <h2 id="bot-leaderboard-title" className="landing-bot-leaderboard-title">
            {BOT_PAGE_LEADERBOARD.title}
          </h2>
          <p className="landing-bot-leaderboard-lead">{BOT_PAGE_LEADERBOARD.lead}</p>
        </motion.div>

        <motion.div {...fadeUp(0.06)} className="landing-bot-leaderboard-panel landing-glass-card">
          <div className="landing-bot-leaderboard-panel-head">
            <h3 className="landing-bot-leaderboard-panel-title">Top wins</h3>
            <span className="landing-bot-leaderboard-panel-meta">On-chain · HypurrScan</span>
          </div>

          {loading && !showTop ? (
            <p className="landing-bot-leaderboard-empty">Loading verified trades…</p>
          ) : !showTop ? (
            <p className="landing-bot-leaderboard-empty">
              Profitable bot closes will appear here — all verifiable on HypurrScan.
            </p>
          ) : (
            <div className="landing-bot-leaderboard-table-wrap">
              <table className="landing-bot-leaderboard-table">
                <thead>
                  <tr>
                    <th scope="col">Wallet</th>
                    <th scope="col">Pair</th>
                    <th scope="col">Side</th>
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
                  {topTrades.map((trade) => (
                    <tr key={trade.id}>
                      <td className="is-mono">0x{trade.walletLabel}</td>
                      <td>{trade.pair}</td>
                      <td>
                        <span
                          className={`landing-bot-leaderboard-side landing-bot-leaderboard-side--${trade.direction.toLowerCase()}`}
                        >
                          {trade.direction}
                        </span>
                      </td>
                      <td>{fmtWhen(trade.openedAt)}</td>
                      <td>{fmtWhen(trade.closedAt)}</td>
                      <td className="is-num is-profit">{fmtUsd(trade.profitUsd)}</td>
                      <td className="is-action">
                        <a
                          href={trade.verifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="landing-bot-leaderboard-verify"
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
          )}
        </motion.div>

        <motion.div {...fadeUp(0.1)} className="landing-bot-leaderboard-live landing-glass-card">
          <div className="landing-bot-leaderboard-live-head">
            <span className="landing-bot-leaderboard-live-dot" aria-hidden />
            <h3 className="landing-bot-leaderboard-live-title">Live wins</h3>
            <span className="landing-bot-leaderboard-live-meta">Recent profitable closes · live HL</span>
          </div>

          {!showLive && !loading ? (
            <p className="landing-bot-leaderboard-empty landing-bot-leaderboard-empty--compact">
              No live wins in the last hour yet.
            </p>
          ) : (
            <ul className="landing-bot-leaderboard-live-list">
              {(showLive ? liveTrades : []).map((trade) => (
                <li key={`live-${trade.id}`} className="landing-bot-leaderboard-live-row">
                  <div className="landing-bot-leaderboard-live-main">
                    <span className="is-mono">0x{trade.walletLabel}</span>
                    <span className="landing-bot-leaderboard-live-pair">
                      {trade.pair} {trade.direction}
                    </span>
                    {trade.isLive ? (
                      <span className="landing-bot-leaderboard-live-badge">LIVE</span>
                    ) : null}
                  </div>
                  <div className="landing-bot-leaderboard-live-side">
                    <strong className="is-profit">{fmtUsd(trade.profitUsd)}</strong>
                    <span className="landing-bot-leaderboard-live-when">{fmtRelative(trade.closedAt)}</span>
                    <a
                      href={trade.verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="landing-bot-leaderboard-verify landing-bot-leaderboard-verify--inline"
                    >
                      Verify
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>
    </section>
  );
};

export default BotPublicLeaderboard;
