import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { goToOpenApp } from '../../lib/appUrls';
import {
  fetchLandingPredictionStats,
  fetchLandingSportsEvents,
  type LandingPredictionStats,
  type LandingSportsEvent,
} from '../../lib/api/landingSportsEvents';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

type CardTheme = 'btc' | 'pairs' | 'sports' | 'predictions';

type VillaCardProps = {
  theme: CardTheme;
  title: string;
  priceBadge: string;
  rating: string;
  description: string;
  cta: string;
  href: string;
  onClick: () => void;
  delay?: number;
};

const VillaCard: React.FC<VillaCardProps> = ({
  theme,
  title,
  priceBadge,
  rating,
  description,
  cta,
  href,
  onClick,
  delay = 0,
}) => (
  <motion.article {...fadeUp(delay)} className="landing-villa-card">
    <div className={`landing-villa-card-media landing-villa-card-media--${theme}`}>
      <div className="landing-villa-card-dots" aria-hidden>
        <span className="landing-villa-card-dot landing-villa-card-dot--on" />
        <span className="landing-villa-card-dot" />
        <span className="landing-villa-card-dot" />
        <span className="landing-villa-card-dot" />
      </div>
    </div>
    <div className="landing-villa-card-body">
      <div className="landing-villa-card-head">
        <h3 className="landing-villa-card-title">{title}</h3>
        <span className="landing-villa-card-price">{priceBadge}</span>
      </div>
      <p className="landing-villa-card-rating">{rating}</p>
      <p className="landing-villa-card-desc">{description}</p>
      <a
        href={href}
        className="landing-villa-card-cta"
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
      >
        {cta}
      </a>
    </div>
  </motion.article>
);

const LandingProductCards: React.FC = () => {
  const [sportsEvents, setSportsEvents] = useState<LandingSportsEvent[]>([]);
  const [predictionStats, setPredictionStats] = useState<LandingPredictionStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [events, stats] = await Promise.all([
          fetchLandingSportsEvents(4),
          fetchLandingPredictionStats(),
        ]);
        if (cancelled) return;
        setSportsEvents(events);
        setPredictionStats(stats);
      } catch {
        if (!cancelled) setSportsEvents([]);
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const sportsDesc =
    sportsEvents.length > 0
      ? `Live on Hyperliquid — ${sportsEvents
          .slice(0, 2)
          .map((e) => e.title)
          .join(' · ')}`
      : 'World Cup, football, and basketball markets with on-chain settlement on Hyperliquid.';

  const predictionsDesc = predictionStats
    ? `${predictionStats.total} live markets — crypto, macro, and event outcomes settled on HL.`
    : 'Macro, crypto, and event markets with on-chain odds and settlement on Hyperliquid.';

  return (
    <section
      className="landing-gmx-section landing-gmx-product-cards-section"
      aria-labelledby="landing-product-cards-title"
    >
      <div className="landing-gmx-container">
        <motion.h2 {...fadeUp(0)} id="landing-product-cards-title" className="landing-gmx-section-title">
          Trade and bet from one HL account
        </motion.h2>

        <div className="landing-gmx-product-cards-grid">
          <VillaCard
            theme="btc"
            title="Trade Bitcoin"
            priceBadge="40x max"
            rating="Perps · 24/7 execution"
            description="BTC-USD perpetuals on Hyperliquid with bot automation, live chart, and USDC margin."
            cta="Open market"
            href="/"
            onClick={() => goToOpenApp('', false)}
            delay={0.04}
          />
          <VillaCard
            theme="pairs"
            title="200+ HL pairs"
            priceBadge="Deep book"
            rating="Bot · Multi-slot"
            description="Scan every liquid Hyperliquid perp — independent slots, global MTF signals, and automated entries."
            cta="Open market"
            href="/"
            onClick={() => goToOpenApp('', false)}
            delay={0.08}
          />
          <VillaCard
            theme="sports"
            title="Bet on Sports"
            priceBadge="HIP-4"
            rating={
              sportsEvents.length > 0
                ? `${sportsEvents.length} live events`
                : 'Live · On-chain'
            }
            description={sportsDesc}
            cta="Open market"
            href="/?section=sportsbets"
            onClick={() => goToOpenApp('?section=sportsbets', false)}
            delay={0.12}
          />
          <VillaCard
            theme="predictions"
            title="Predictions"
            priceBadge={
              predictionStats ? `${predictionStats.total} markets` : 'Macro + crypto'
            }
            rating={
              predictionStats
                ? `${predictionStats.crypto} crypto · ${predictionStats.sports} sports`
                : 'HIP-4 · Events'
            }
            description={predictionsDesc}
            cta="Open market"
            href="/?section=sportsbets"
            onClick={() => goToOpenApp('?section=sportsbets', false)}
            delay={0.16}
          />
        </div>
      </div>
    </section>
  );
};

export default LandingProductCards;
