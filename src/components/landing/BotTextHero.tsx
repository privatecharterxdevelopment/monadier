import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingHeroLines from './LandingHeroLines';
import LandingSocialProof from './LandingSocialProof';
import { BOT_PAGE_HERO } from '../../lib/seo/tradingBotContent';
import { goToOpenApp } from '../../lib/appUrls';

const BotTextHero: React.FC = () => (
  <section
    className="landing-gmx-hero landing-gmx-hero--centered landing-gmx-hero--text-only landing-gmx-gutter"
    aria-label="Hyperliquid trading bot"
  >
    <div className="landing-gmx-shell landing-bot-text-hero-shell">
      <div className="landing-bot-text-hero-copy">
        <LandingHeroLines
          lineDarkTop={BOT_PAGE_HERO.title}
          rotateLines={BOT_PAGE_HERO.rotateLines}
          rotatePosition="two-row"
          rotateSuffix={BOT_PAGE_HERO.footer}
          tightRotateSuffix
          className="landing-bot-text-hero-lines"
        />
        <p className="landing-bot-text-hero-tagline">{BOT_PAGE_HERO.tagline}</p>
        <p className="landing-bot-text-hero-lead">{BOT_PAGE_HERO.lead}</p>
        <div className="landing-gmx-hero-cta landing-gmx-hero-cta--centered landing-gmx-hero-cta-row landing-bot-text-hero-cta">
          <button
            type="button"
            className="landing-gmx-btn-primary"
            onClick={() => goToOpenApp('?section=bot', false)}
          >
            Start bot
            <ArrowRight size={16} aria-hidden />
          </button>
          <Link to="/how-it-works" className="landing-gmx-btn-secondary">
            How it works
          </Link>
        </div>
        <div className="landing-bot-text-hero-social">
          <LandingSocialProof worldwide />
        </div>
      </div>
    </div>
  </section>
);

export default BotTextHero;
