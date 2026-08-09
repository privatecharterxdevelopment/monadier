import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LandingBetSportWidgetCard from './LandingBetSportWidgetCard';
import {
  fetchLandingBetMarkets,
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
  surface?: 'photo' | 'light';
};

const BetMarketCard: React.FC<BetMarketCardProps> = ({ market, delay = 0, surface = 'photo' }) => (
  <motion.div {...fadeUp(delay)}>
    <LandingBetSportWidgetCard market={market} surface={surface} />
  </motion.div>
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
  limit = 4,
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
      : 'landing-bet-cards-grid landing-bet-cards-grid--glass';

  const sectionClass =
    layout === 'home'
      ? 'landing-gmx-section landing-gmx-gutter landing-gmx-product-cards-section landing-bet-cards-section'
      : `landing-gmx-section landing-gmx-gutter landing-bet-cards-section${
          flushTop ? ' landing-bet-cards-section--flush' : ''
        }`;

  if (!loading && markets.length === 0) return null;

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
              <div
                key={i}
                className={`landing-sport-widget-card landing-sport-widget-card--skeleton${
                  layout === 'page' ? ' landing-sport-widget-card--light' : ''
                }`}
                aria-hidden
              />
            ))}
          </div>
        ) : null}

        {markets.length > 0 ? (
          <div className={gridClass}>
            {markets.map((market, i) => (
              <BetMarketCard
                key={market.id}
                market={market}
                delay={0.04 + i * 0.03}
                surface={layout === 'page' ? 'light' : 'photo'}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default LandingBetMarketCards;
