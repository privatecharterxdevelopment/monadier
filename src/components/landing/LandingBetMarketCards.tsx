import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { goToOpenApp } from '../../lib/appUrls';
import {
  fetchLandingBetMarkets,
  LANDING_BET_STAKE_USD,
  type LandingBetMarket,
} from '../../lib/api/landingSportsEvents';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

type BetMarketCardProps = {
  market: LandingBetMarket;
  delay?: number;
};

const BetMarketCard: React.FC<BetMarketCardProps> = ({ market, delay = 0 }) => (
  <motion.article {...fadeUp(delay)} className="landing-bet-card">
    <div
      className="landing-bet-card-media"
      style={{ backgroundImage: `url(${market.backgroundImage})` }}
    >
      <div className="landing-bet-card-media-overlay" aria-hidden />
      {market.isLive ? (
        <span className="landing-bet-card-live">
          {market.indicative ? 'Live · mid' : 'Live'}
        </span>
      ) : null}
    </div>
    <div className="landing-bet-card-body">
      <div className="landing-bet-card-head">
        <h3 className="landing-bet-card-title">{market.title}</h3>
        <span className="landing-bet-card-odds">{market.odds}</span>
      </div>
      <p className="landing-bet-card-meta">
        <span className="landing-bet-card-win">{market.winRate} win</span>
        <span className="landing-bet-card-sep">·</span>
        <span>{market.selection}</span>
      </p>
      <p className="landing-bet-card-desc">
        ${LANDING_BET_STAKE_USD} stake → <strong>{market.payoutLabel}</strong> if Yes wins (
        {market.profitLabel} profit). {market.categoryBadge}.
      </p>
      <a
        href="/?section=sportsbets"
        className="landing-bet-card-cta"
        onClick={(e) => {
          e.preventDefault();
          goToOpenApp('?section=sportsbets', false);
        }}
      >
        Open market
      </a>
    </div>
  </motion.article>
);

type Props = {
  limit?: number;
  /** Section heading — omit to hide the whole header block */
  title?: string | null;
  subtitle?: string | null;
  /** 4-up grid (homepage) vs 2×4 grid (betting page) */
  layout?: 'home' | 'page';
};

const LandingBetMarketCards: React.FC<Props> = ({
  limit = 8,
  title = null,
  subtitle = null,
  layout = 'page',
}) => {
  const [markets, setMarkets] = useState<LandingBetMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const showHeader = Boolean(title || subtitle);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await fetchLandingBetMarkets(limit);
        if (!cancelled) {
          setMarkets(next);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setMarkets([]);
          setLoading(false);
        }
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [limit]);

  const gridClass =
    layout === 'home'
      ? 'landing-bet-cards-grid landing-bet-cards-grid--home'
      : 'landing-bet-cards-grid';

  const sectionClass =
    layout === 'home'
      ? 'landing-gmx-section landing-gmx-product-cards-section landing-bet-cards-section'
      : 'landing-gmx-section landing-bet-cards-section';

  return (
    <section
      className={sectionClass}
      aria-labelledby={showHeader ? 'landing-bet-cards-title' : undefined}
    >
      <div className="landing-gmx-container">
        {showHeader ? (
          <motion.div {...fadeUp(0)} className="landing-bet-cards-intro">
            {title ? (
              <h2 id="landing-bet-cards-title" className="landing-gmx-section-title">
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className="landing-bet-cards-sub">{subtitle}</p> : null}
          </motion.div>
        ) : null}

        {loading && markets.length === 0 ? (
          <div className={`${gridClass} landing-bet-cards-grid--loading`}>
            {Array.from({ length: limit }, (_, i) => (
              <div key={i} className="landing-bet-card landing-bet-card--skeleton" aria-hidden />
            ))}
          </div>
        ) : null}

        {!loading && markets.length === 0 ? (
          <p className="landing-bet-cards-empty">
            Markets loading from Hyperliquid — open the app to browse live odds.
          </p>
        ) : null}

        {markets.length > 0 ? (
          <div className={gridClass}>
            {markets.map((market, i) => (
              <BetMarketCard key={market.id} market={market} delay={0.04 + i * 0.03} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default LandingBetMarketCards;
