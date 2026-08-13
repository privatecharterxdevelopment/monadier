import React from 'react';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';
import { dashboardPreview } from '../../assets/landing/dashboardPreview';

const PRODUCT_CARDS = [
  {
    id: 'bot',
    title: 'Full auto bot trading',
    desc: 'AI scans 200+ HL perps — opens, trails profit, and cuts losers 24/7.',
    image: dashboardPreview,
    cta: 'Start agent',
    section: '',
  },
  {
    id: 'perps',
    title: 'Pro perps trading',
    desc: 'Live charts, depth, and execution on Hyperliquid — same liquidity the agent uses.',
    image: '/images/landing/hero-visual.png',
    cta: 'Trade perps',
    section: '',
  },
  {
    id: 'betting',
    title: 'Sports betting',
    desc: 'HIP-4 outcome markets — macro, crypto, and live sports on-chain.',
    image: '/images/betting/sports-hero.png',
    cta: 'Open betting',
    section: 'sportsbets',
  },
] as const;

type Props = {
  revealed: boolean;
};

const LandingHeroProductCards: React.FC<Props> = ({ revealed }) => (
  <div
    className={`landing-gmx-product-row${revealed ? ' landing-gmx-product-row--revealed' : ''}`}
    aria-hidden={!revealed}
  >
    {PRODUCT_CARDS.map((card) => (
      <article
        key={card.id}
        className="landing-gmx-product-card"
        style={{ backgroundImage: `url(${card.image})` }}
      >
        <div className="landing-gmx-product-card-shade" aria-hidden />
        <div className="landing-gmx-product-card-copy">
          <h2 className="landing-gmx-product-card-title">{card.title}</h2>
          <p className="landing-gmx-product-card-desc">{card.desc}</p>
          <button
            type="button"
            className="landing-gmx-product-card-cta"
            onClick={() => goToOpenApp(card.section ? `?section=${card.section}` : '', false)}
          >
            {card.cta}
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </article>
    ))}
  </div>
);

export default LandingHeroProductCards;
