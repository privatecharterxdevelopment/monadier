import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import LandingNav from './LandingNav';
import LandingHeroLines from './LandingHeroLines';
import LandingHomeBentoCards from './LandingHomeBentoCards';
import LandingProductPreview from './LandingProductPreview';
import LandingPartnerLogos from './LandingPartnerLogos';
import LandingFaqSection from './LandingFaqSection';
import LandingFooter from './LandingFooter';
import OpenAppLink from '../layout/OpenAppLink';

const LANDING_ROTATE_LINES = [
  'on Hyperliquid',
  'with automated perps',
  'on verified sports on-chain',
  'with hedge-fund signals',
  'with deep HL liquidity',
  'with an AI agent that performs',
  'across 200+ markets',
] as const;

const GmxStyleLanding: React.FC = () => {
  const [heroRevealed, setHeroRevealed] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);

    const onScroll = () => {
      setHeroRevealed(window.scrollY > 36);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing-gmx">
      <LandingNav variant="light" layout="gmx" />

      <section
        className={`landing-gmx-hero landing-gmx-gutter${heroRevealed ? ' landing-gmx-hero--revealed' : ''}`}
      >
        <div className="landing-gmx-shell landing-gmx-hero-shell">
          <div className="landing-gmx-hero-stage">
            <img
              className="landing-gmx-hero-visual"
              src="/images/landing/hero-visual.png"
              alt=""
              aria-hidden
              decoding="async"
            />
            <div className="landing-gmx-hero-viewport">
              <LandingHeroLines
                lineDarkTop="Trade"
                rotateLines={LANDING_ROTATE_LINES}
                lineDarkBottom="from your HL account"
              />
            </div>
            <div className="landing-gmx-hero-bottom" aria-hidden={!heroRevealed}>
              <div className="landing-gmx-hero-bottom-left">
                <div className="landing-gmx-hero-cta">
                  <OpenAppLink className="landing-gmx-btn-primary">
                    Open app
                    <ArrowRight size={16} />
                  </OpenAppLink>
                </div>
              </div>
              <div className="landing-gmx-hero-stats">
                <div className="landing-gmx-hero-stat">
                  <div className="landing-gmx-hero-stat-value">24/7</div>
                  <div className="landing-gmx-hero-stat-label">Bot uptime</div>
                </div>
                <div className="landing-gmx-hero-stat">
                  <div className="landing-gmx-hero-stat-value">HL</div>
                  <div className="landing-gmx-hero-stat-label">Execution</div>
                </div>
                <div className="landing-gmx-hero-stat">
                  <div className="landing-gmx-hero-stat-value">200+</div>
                  <div className="landing-gmx-hero-stat-label">Markets</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingHomeBentoCards />
      <LandingProductPreview />
      <LandingPartnerLogos />
      <LandingFaqSection />
      <LandingFooter />
    </div>
  );
};

export default GmxStyleLanding;
