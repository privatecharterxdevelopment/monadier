import React, { useEffect, useState } from 'react';
import LandingNav from './LandingNav';
import LandingHeroLines from './LandingHeroLines';
import LandingHeroProductCards from './LandingHeroProductCards';
import LandingHomeBentoCards from './LandingHomeBentoCards';
import LandingFaqSection from './LandingFaqSection';
import LandingFooter from './LandingFooter';

const LANDING_ROTATE_LINES = [
  'on Hyperliquid',
  'with automated perps',
  'on verified sports on-chain',
  'with hedge-fund signals',
  'with deep HL liquidity',
  'across 200+ markets',
] as const;

const GmxStyleLanding: React.FC = () => {
  const [heroRevealed, setHeroRevealed] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);

    const onScroll = () => {
      setHeroRevealed(window.scrollY > 48);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing-gmx">
      <LandingNav variant="light" layout="gmx" />

      <section
        className={`landing-gmx-hero landing-gmx-gutter landing-gmx-hero--centered${
          heroRevealed ? ' landing-gmx-hero--revealed' : ''
        }`}
      >
        <div className="landing-gmx-shell landing-gmx-hero-shell">
          <div className="landing-gmx-hero-stage">
            <div className="landing-gmx-hero-viewport">
              <div className="landing-gmx-hero-main">
                <LandingHeroLines
                  lineDarkTop="Trade"
                  lineDarkBottom="from your HL account"
                  rotateLines={LANDING_ROTATE_LINES}
                  rotatePosition="two-row"
                />
              </div>
            </div>
            <LandingHeroProductCards revealed={heroRevealed} />
          </div>
        </div>
      </section>

      <LandingHomeBentoCards />
      <LandingFaqSection />
      <LandingFooter />
    </div>
  );
};

export default GmxStyleLanding;
