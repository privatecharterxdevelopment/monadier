import React, { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import LandingNav from './LandingNav';
import LandingHeroLines from './LandingHeroLines';
import LandingBetMarketCards from './LandingBetMarketCards';
import LandingProductPreview from './LandingProductPreview';
import LandingPartnerLogos from './LandingPartnerLogos';
import LandingFaqSection from './LandingFaqSection';
import LandingFooter from './LandingFooter';
import OpenAppLink from '../layout/OpenAppLink';

const heroReveal = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

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
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-gmx">
      <LandingNav variant="light" layout="gmx" />

      <section className="landing-gmx-hero">
        <div className="landing-gmx-hero-shell">
          <div className="landing-gmx-hero-stage">
            <div className="landing-gmx-hero-stack">
              <LandingHeroLines
                lineDarkTop="Trade"
                rotateLines={LANDING_ROTATE_LINES}
                lineDarkBottom="from your HL account"
              />
              <motion.div {...heroReveal(0.1)} className="landing-gmx-hero-bottom">
                <div className="landing-gmx-hero-bottom-left">
                  <div className="landing-gmx-hero-cta">
                    <OpenAppLink className="landing-gmx-btn-primary">
                      Open app
                      <ArrowRight size={16} />
                    </OpenAppLink>
                  </div>
                  <p className="landing-gmx-hero-lead">
                    Automated perpetuals and on-chain sports betting on Hyperliquid — deposit USDC,
                    approve the bot agent once, and trade or bet from your HL account 24/7.
                  </p>
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
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <LandingBetMarketCards
        limit={4}
        layout="home"
        title="Trade and bet from one HL account"
      />
      <LandingProductPreview />
      <LandingPartnerLogos />
      <LandingFaqSection />
      <LandingFooter />
    </div>
  );
};

export default GmxStyleLanding;
