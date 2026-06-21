import React, { useEffect, useState } from 'react';
import { ArrowRight, Heart } from 'lucide-react';
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

type CardStat = { label: string; value: string };

type StaticCard = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  onClick: () => void;
  theme: 'btc' | 'pairs' | 'predictions';
  stats: CardStat[];
  footerLabel: string;
  footerValue: string;
  footerLevel: 'easy' | 'moderate' | 'hard';
};

const STATIC_CARDS: StaticCard[] = [
  {
    id: 'btc',
    badge: 'Perps',
    title: 'Trade on Bitcoin',
    subtitle: 'BTC-USD · Hyperliquid',
    cta: 'Open BTC',
    href: '/',
    onClick: () => goToOpenApp('', false),
    theme: 'btc',
    stats: [
      { label: 'Markets', value: 'BTC' },
      { label: 'Leverage', value: '40x' },
      { label: 'Margin', value: 'USDC' },
    ],
    footerLabel: 'Execution',
    footerValue: '24/7',
    footerLevel: 'easy',
  },
  {
    id: 'pairs',
    badge: 'Popular',
    title: 'Trade on 200+ pairs',
    subtitle: 'All HL perpetuals',
    cta: 'Open terminal',
    href: '/',
    onClick: () => goToOpenApp('', false),
    theme: 'pairs',
    stats: [
      { label: 'Markets', value: '200+' },
      { label: 'Bot', value: '24/7' },
      { label: 'Liquidity', value: 'Deep' },
    ],
    footerLabel: 'Coverage',
    footerValue: '4.9',
    footerLevel: 'moderate',
  },
  {
    id: 'predictions',
    badge: 'HIP-4',
    title: 'Bet on predictions',
    subtitle: 'Macro · crypto · events',
    cta: 'Open markets',
    href: '/?section=sportsbets',
    onClick: () => goToOpenApp('?section=sportsbets', false),
    theme: 'predictions',
    stats: [
      { label: 'Crypto', value: '—' },
      { label: 'Macro', value: '—' },
      { label: 'More', value: '—' },
    ],
    footerLabel: 'Markets',
    footerValue: 'Live',
    footerLevel: 'hard',
  },
];

function levelWidth(level: StaticCard['footerLevel']): string {
  if (level === 'easy') return '38%';
  if (level === 'moderate') return '62%';
  return '88%';
}

function levelColor(level: StaticCard['footerLevel']): string {
  if (level === 'easy') return '#3dd68c';
  if (level === 'moderate') return '#60a5fa';
  return '#f472b6';
}

type CardShellProps = {
  badge: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  onClick: () => void;
  theme: StaticCard['theme'] | 'sports';
  stats: CardStat[];
  footerLabel: string;
  footerValue: string;
  footerLevel: StaticCard['footerLevel'];
  footerExtra?: React.ReactNode;
  delay?: number;
};

const ProductCard: React.FC<CardShellProps> = ({
  badge,
  title,
  subtitle,
  cta,
  href,
  onClick,
  theme,
  stats,
  footerLabel,
  footerValue,
  footerLevel,
  footerExtra,
  delay = 0,
}) => (
  <motion.article {...fadeUp(delay)} className="landing-gmx-product-card">
    <div className={`landing-gmx-product-card-visual landing-gmx-product-card-visual--${theme}`}>
      <div className="landing-gmx-product-card-visual-top">
        <span className="landing-gmx-product-card-badge">{badge}</span>
        <button type="button" className="landing-gmx-product-card-fav" aria-label="Save">
          <Heart size={16} />
        </button>
      </div>
      <div className="landing-gmx-product-card-visual-copy">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <a
        href={href}
        className="landing-gmx-product-card-cta"
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
      >
        {cta}
        <ArrowRight size={14} />
      </a>
    </div>
    <div className="landing-gmx-product-card-body">
      <div className="landing-gmx-product-card-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="landing-gmx-product-card-stat">
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="landing-gmx-product-card-footer">
        <div className="landing-gmx-product-card-level">
          <span>{footerLabel}</span>
          <div className="landing-gmx-product-card-level-bar">
            <span
              style={{
                width: levelWidth(footerLevel),
                background: levelColor(footerLevel),
              }}
            />
          </div>
          <strong>{footerValue}</strong>
        </div>
        <div className="landing-gmx-product-card-graphic">{footerExtra ?? '◎'}</div>
      </div>
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
        if (!cancelled) {
          setSportsEvents([]);
        }
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const predictionsCard = STATIC_CARDS.find((c) => c.id === 'predictions');
  const predictionsStats: CardStat[] = predictionStats
    ? [
        { label: 'Crypto', value: String(predictionStats.crypto) },
        { label: 'Macro', value: String(predictionStats.macro) },
        { label: 'Sports', value: String(predictionStats.sports) },
      ]
    : (predictionsCard?.stats ?? []);

  const sportsStats: CardStat[] =
    sportsEvents.length > 0
      ? [
          { label: 'Live', value: String(sportsEvents.length) },
          { label: 'Legs', value: String(sportsEvents[0]?.legs ?? '—') },
          { label: 'HL', value: 'HIP-4' },
        ]
      : [
          { label: 'Markets', value: 'Live' },
          { label: 'Odds', value: 'On-chain' },
          { label: 'Settle', value: 'HL' },
        ];

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
          {STATIC_CARDS.filter((c) => c.id !== 'predictions').map((card, i) => (
            <ProductCard key={card.id} {...card} delay={0.04 + i * 0.05} />
          ))}

          <ProductCard
            badge="Live"
            title="Bet on Sports"
            subtitle={
              sportsEvents[0]?.subtitle ??
              'World Cup · football · basketball'
            }
            cta="Open betting"
            href="/?section=sportsbets"
            onClick={() => goToOpenApp('?section=sportsbets', false)}
            theme="sports"
            stats={sportsStats}
            footerLabel="Events"
            footerValue={sportsEvents.length > 0 ? 'Live' : '…'}
            footerLevel="moderate"
            delay={0.14}
            footerExtra={
              <ul className="landing-gmx-product-card-events">
                {(sportsEvents.length > 0
                  ? sportsEvents
                  : [{ id: 'loading', title: 'Loading HL sports…', badge: '', subtitle: '', legs: 0 }]
                )
                  .slice(0, 3)
                  .map((event) => (
                    <li key={event.id}>
                      <span>{event.title}</span>
                    </li>
                  ))}
              </ul>
            }
          />

          {predictionsCard ? (
            <ProductCard
              {...predictionsCard}
              stats={predictionsStats}
              footerValue={predictionStats ? String(predictionStats.total) : predictionsCard.footerValue}
              delay={0.19}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default LandingProductCards;
