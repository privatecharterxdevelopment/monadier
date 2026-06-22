import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';
import OpenAppLink from '../layout/OpenAppLink';
import {
  fetchLandingBetMarkets,
  fetchLandingPredictionStats,
  LANDING_BET_STAKE_USD,
  type LandingBetMarket,
  type LandingPredictionStats,
} from '../../lib/api/landingSportsEvents';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

const HERO_FEATURES = [
  {
    key: 'bot',
    title: 'Automated perps',
    desc: 'MTF scan across every liquid HL pair — bot opens, trails profit, and cuts losers.',
    visual: 'bot' as const,
  },
  {
    key: 'markets',
    title: '200+ HL markets',
    desc: 'BTC, ETH, alts — deep book, up to 40× leverage, USDC margin from your account.',
    visual: 'markets' as const,
  },
  {
    key: 'predictions',
    title: 'Predictions & sports',
    desc: 'HIP-4 outcome markets — macro, crypto, and live sports settled on Hyperliquid.',
    visual: 'predictions' as const,
  },
] as const;

function HeroFeatureVisual({
  kind,
  stats,
}: {
  kind: (typeof HERO_FEATURES)[number]['visual'];
  stats: LandingPredictionStats | null;
}) {
  if (kind === 'bot') {
    return (
      <div className="landing-bento-mock landing-bento-mock--bot" aria-hidden>
        <div className="landing-bento-mock-scan">
          <span className="landing-bento-mock-pill landing-bento-mock-pill--live">Scan</span>
          <span className="landing-bento-mock-pill">ETH LONG 78%</span>
          <span className="landing-bento-mock-pill landing-bento-mock-pill--muted">1m · 5m · 1h</span>
        </div>
        <div className="landing-bento-mock-chart">
          <svg viewBox="0 0 200 64" preserveAspectRatio="none">
            <path
              d="M0 48 L24 42 L48 50 L72 28 L96 34 L120 18 L144 24 L168 12 L200 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M0 48 L24 42 L48 50 L72 28 L96 34 L120 18 L144 24 L168 12 L200 8 L200 64 L0 64 Z"
              fill="url(#bentoGrad)"
              opacity="0.35"
            />
            <defs>
              <linearGradient id="bentoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    );
  }

  if (kind === 'markets') {
    const pairs = ['BTC', 'ETH', 'SOL', 'HYPE', 'ARB', 'DOGE', 'AVAX', 'LINK'];
    return (
      <div className="landing-bento-mock landing-bento-mock--markets" aria-hidden>
        <div className="landing-bento-mock-pair-grid">
          {pairs.map((p, i) => (
            <span
              key={p}
              className={`landing-bento-mock-pair${i === 0 ? ' landing-bento-mock-pair--hot' : ''}`}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const total = stats?.total ?? 120;
  const sports = stats?.sports ?? 24;
  const crypto = stats?.crypto ?? 48;

  return (
    <div className="landing-bento-mock landing-bento-mock--predictions" aria-hidden>
      <div className="landing-bento-mock-stat-row">
        <div className="landing-bento-mock-stat">
          <span className="landing-bento-mock-stat-val">{total}+</span>
          <span className="landing-bento-mock-stat-lbl">Live markets</span>
        </div>
        <div className="landing-bento-mock-stat">
          <span className="landing-bento-mock-stat-val">{sports}</span>
          <span className="landing-bento-mock-stat-lbl">Sports</span>
        </div>
        <div className="landing-bento-mock-stat">
          <span className="landing-bento-mock-stat-val">{crypto}</span>
          <span className="landing-bento-mock-stat-lbl">Crypto</span>
        </div>
      </div>
      <div className="landing-bento-mock-tags">
        <span>Macro</span>
        <span>Events</span>
        <span>HIP-4</span>
      </div>
    </div>
  );
}

type GlassBetCardProps = {
  market: LandingBetMarket;
  delay?: number;
};

function BotAiAnimation() {
  return (
    <div className="landing-bento-ai-stage" aria-hidden>
      <div className="landing-bento-ai-orbit">
        <span className="landing-bento-ai-ring landing-bento-ai-ring--outer" />
        <span className="landing-bento-ai-ring landing-bento-ai-ring--inner" />
        <span className="landing-bento-ai-core">
          <span className="landing-bento-ai-core-glow" />
          AI
        </span>
      </div>
      <div className="landing-bento-ai-pills">
        <span className="landing-bento-ai-pill landing-bento-ai-pill--a">Scanning HL</span>
        <span className="landing-bento-ai-pill landing-bento-ai-pill--b">BTC LONG 81%</span>
        <span className="landing-bento-ai-pill landing-bento-ai-pill--c">Trail armed</span>
      </div>
      <div className="landing-bento-ai-beam" />
      <svg className="landing-bento-ai-spark" viewBox="0 0 240 80" preserveAspectRatio="none">
        <path
          className="landing-bento-ai-spark-line"
          d="M0 58 L30 52 L60 56 L90 38 L120 44 L150 28 L180 34 L210 20 L240 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

type PromoBannerProps = {
  title: string;
  desc: string;
  cta: string;
  href: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  delay?: number;
  visual: React.ReactNode;
  visualClassName?: string;
};

const PromoBanner: React.FC<PromoBannerProps> = ({
  title,
  desc,
  cta,
  href,
  onClick,
  delay = 0,
  visual,
  visualClassName = '',
}) => (
  <motion.article {...fadeUp(delay)} className="landing-bento-promo-card landing-glass-card">
    <div className="landing-bento-promo-copy">
      <h3 className="landing-bento-promo-title">{title}</h3>
      <p className="landing-bento-promo-desc">{desc}</p>
    </div>
    <div className={`landing-bento-promo-visual ${visualClassName}`.trim()}>{visual}</div>
    <a href={href} className="landing-bento-promo-cta" onClick={onClick}>
      {cta}
      <ArrowRight size={15} aria-hidden />
    </a>
  </motion.article>
);

const GlassBetCard: React.FC<GlassBetCardProps> = ({ market, delay = 0 }) => (
  <motion.article {...fadeUp(delay)} className="landing-bento-bet-card landing-glass-card">
    <div className="landing-bento-bet-copy">
      <h3 className="landing-bento-bet-title">{market.title}</h3>
      <p className="landing-bento-bet-desc">
        {market.selection} · {market.winRate} implied · {market.categoryBadge}
      </p>
    </div>

    <div
      className="landing-bento-bet-visual"
      style={{ backgroundImage: `url(${market.backgroundImage})` }}
    >
      <div className="landing-bento-bet-visual-glass" aria-hidden />
      {market.isLive ? (
        <span className="landing-bento-bet-live">
          {market.indicative ? 'Live · mid' : 'Live'}
        </span>
      ) : null}
      <div className="landing-bento-bet-odds-float">
        <span className="landing-bento-bet-odds">{market.odds}</span>
        <span className="landing-bento-bet-payout">
          ${LANDING_BET_STAKE_USD} → <strong>{market.payoutLabel}</strong>
        </span>
      </div>
    </div>

    <a
      href="/?section=sportsbets"
      className="landing-bento-bet-cta"
      onClick={(e) => {
        e.preventDefault();
        goToOpenApp('?section=sportsbets', false);
      }}
    >
      Open market
      <ArrowRight size={15} aria-hidden />
    </a>
  </motion.article>
);

const LandingHomeBentoCards: React.FC = () => {
  const [markets, setMarkets] = useState<LandingBetMarket[]>([]);
  const [stats, setStats] = useState<LandingPredictionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [next, predictionStats] = await Promise.all([
          fetchLandingBetMarkets(3),
          fetchLandingPredictionStats(),
        ]);
        if (!cancelled) {
          setMarkets(next);
          setStats(predictionStats);
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
  }, []);

  return (
    <section
      className="landing-gmx-section landing-gmx-gutter landing-home-bento-section"
      aria-labelledby="landing-home-bento-title"
    >
      <div className="landing-gmx-shell landing-home-bento-container">
        <motion.header {...fadeUp(0)} className="landing-home-bento-header">
          <div className="landing-home-bento-header-main">
            <span className="landing-home-bento-index">01</span>
            <h2 id="landing-home-bento-title" className="landing-home-bento-title">
              Trade and bet from one HL account
            </h2>
          </div>
          <p className="landing-home-bento-sub">
            Perps bot, deep liquidity, and on-chain predictions — unified on Hyperliquid.
          </p>
        </motion.header>

        <div className="landing-home-bento">
          <motion.article
            {...fadeUp(0.05)}
            className="landing-home-bento-hero landing-glass-card"
          >
            <div className="landing-home-bento-hero-inner">
              {HERO_FEATURES.map((feature, i) => (
                <div key={feature.key} className="landing-home-bento-hero-panel">
                  <div className="landing-home-bento-hero-panel-copy">
                    <h3 className="landing-home-bento-hero-panel-title">{feature.title}</h3>
                    <p className="landing-home-bento-hero-panel-desc">{feature.desc}</p>
                  </div>
                  <HeroFeatureVisual kind={feature.visual} stats={stats} />
                  {i < HERO_FEATURES.length - 1 ? (
                    <span className="landing-home-bento-hero-divider" aria-hidden />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="landing-home-bento-hero-foot">
              <OpenAppLink className="landing-bento-hero-cta">
                Open app
                <ArrowRight size={16} />
              </OpenAppLink>
            </div>
          </motion.article>

          {loading && markets.length === 0
            ? Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="landing-bento-bet-card landing-glass-card landing-bento-bet-card--skeleton"
                  aria-hidden
                />
              ))
            : null}

          {!loading && markets.length === 0 ? (
            <p className="landing-home-bento-empty">
              Live prediction markets loading from Hyperliquid — open the app to browse odds.
            </p>
          ) : null}

          {markets.map((market, i) => (
            <GlassBetCard key={market.id} market={market} delay={0.1 + i * 0.06} />
          ))}

          <div className="landing-home-bento-promos">
            <PromoBanner
              title="Trade by bot"
              desc="AI agent scans 200+ HL perps every cycle — opens entries, trails profit, and cuts losers 24/7."
              cta="Start bot"
              href="/"
              delay={0.28}
              visual={<BotAiAnimation />}
              onClick={(e) => {
                e.preventDefault();
                goToOpenApp('', false);
              }}
            />
            <PromoBanner
              title="Trade the candles"
              desc="Live Hyperliquid charts, depth, and execution — same liquidity the bot reads in real time."
              cta="Open charts"
              href="/"
              delay={0.34}
              visualClassName="landing-bento-promo-visual--candles"
              visual={
                <img
                  src="/images/landing/hero-visual.png"
                  alt=""
                  className="landing-bento-promo-candles-img"
                  decoding="async"
                />
              }
              onClick={(e) => {
                e.preventDefault();
                goToOpenApp('', false);
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingHomeBentoCards;
