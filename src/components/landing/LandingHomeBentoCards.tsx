import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

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
  className?: string;
  hideCopy?: boolean;
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
  className = '',
  hideCopy = false,
}) => (
  <motion.article
    {...fadeUp(delay)}
    className={`landing-bento-promo-card landing-glass-card${className ? ` ${className}` : ''}`}
    aria-label={hideCopy ? title : undefined}
  >
    {!hideCopy ? (
      <div className="landing-bento-promo-copy">
        <h3 className="landing-bento-promo-title">{title}</h3>
        <p className="landing-bento-promo-desc">{desc}</p>
      </div>
    ) : null}
    <div className={`landing-bento-promo-visual ${visualClassName}`.trim()}>{visual}</div>
    <a href={href} className="landing-bento-promo-cta" onClick={onClick}>
      {cta}
      <ArrowRight size={15} aria-hidden />
    </a>
  </motion.article>
);

const LandingHomeBentoCards: React.FC = () => (
  <section
    className="landing-gmx-section landing-gmx-gutter landing-trade-promos-section"
    aria-label="Trading features"
  >
    <div className="landing-trade-promos-shell">
      <div className="landing-home-bento-promos">
        <PromoBanner
          title="Trade by bot"
          desc="AI agent scans 200+ HL perps every cycle — opens entries, trails profit, and cuts losers 24/7."
          cta="Start bot"
          href="/"
          delay={0.08}
          visual={<BotAiAnimation />}
          onClick={(e) => {
            e.preventDefault();
            goToOpenApp('?section=bot', false);
          }}
        />
        <PromoBanner
          title="Trade the candles"
          desc="Live Hyperliquid charts, depth, and execution — same liquidity the bot reads in real time."
          cta="Open charts"
          href="/"
          delay={0.14}
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
        <PromoBanner
          title="Bet on sports and market predictions"
          desc="HIP-4 outcome markets on Hyperliquid — macro, crypto, and live sports with on-chain settlement."
          cta="Open betting"
          href="/"
          delay={0.2}
          className="landing-bento-promo-card--wide"
          visualClassName="landing-bento-promo-visual--sports"
          visual={
            <video
              className="landing-bento-promo-sports-video"
              src="/videos/14757485_1920_1080_25fps.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-hidden
            />
          }
          onClick={(e) => {
            e.preventDefault();
            goToOpenApp('?section=sportsbets', false);
          }}
        />
      </div>
    </div>
  </section>
);

export default LandingHomeBentoCards;
