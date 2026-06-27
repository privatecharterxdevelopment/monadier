import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';
import LandingEventBannerMedia from './LandingEventBannerMedia';
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
  <motion.article {...fadeUp(delay)} className="landing-bet-card landing-gmx-product-card">
    <div className="landing-bet-card-visual">
      <LandingEventBannerMedia
        backgroundImage={market.backgroundImage}
        accentColor={market.accentColor}
        tagline={market.tagline}
        variant={market.variant}
        sideFlags={market.sideFlags}
        emoji={market.emoji}
        className="landing-bet-card-visual-media"
      />
      <div className="landing-bet-card-visual-shade" aria-hidden />
      <div className="landing-bet-card-visual-top">
        <span className="landing-gmx-product-card-badge">{market.categoryBadge}</span>
        {market.isLive ? (
          <span className="landing-bet-card-live-pill">
            {market.indicative ? 'Live · mid' : 'Live'}
          </span>
        ) : null}
      </div>
      <div className="landing-bet-card-visual-copy">
        <h3 className="landing-bet-card-visual-title">{market.title}</h3>
        <p className="landing-bet-card-visual-selection">{market.selection}</p>
      </div>
    </div>
    <div className="landing-bet-card-body">
      <div className="landing-bet-card-stats">
        <div className="landing-bet-card-stat">
          <span className="landing-bet-card-stat-label">Implied</span>
          <span className="landing-bet-card-stat-value">{market.winRate}</span>
        </div>
        <div className="landing-bet-card-stat landing-bet-card-stat--odds">
          <span className="landing-bet-card-stat-label">Odds</span>
          <span className="landing-bet-card-stat-value">{market.odds}</span>
        </div>
      </div>
      <p className="landing-bet-card-payout">
        ${LANDING_BET_STAKE_USD} stake → <strong>{market.payoutLabel}</strong> ({market.profitLabel})
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
        <ArrowRight size={15} aria-hidden />
      </a>
    </div>
  </motion.article>
);

type Props = {
  limit?: number;
  title?: string | null;
  subtitle?: string | null;
  layout?: 'home' | 'page';
  flushTop?: boolean;
  ariaLabel?: string;
};

const LandingBetMarketCards: React.FC<Props> = ({
  limit = 8,
  title = null,
  subtitle = null,
  layout = 'page',
  flushTop = false,
  ariaLabel,
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
      ? 'landing-gmx-section landing-gmx-gutter landing-gmx-product-cards-section landing-bet-cards-section'
      : `landing-gmx-section landing-gmx-gutter landing-bet-cards-section${
          flushTop ? ' landing-bet-cards-section--flush' : ''
        }`;

  return (
    <section
      className={sectionClass}
      aria-labelledby={showHeader ? 'landing-bet-cards-title' : undefined}
      aria-label={!showHeader ? ariaLabel : undefined}
    >
      <div className="landing-gmx-shell">
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
