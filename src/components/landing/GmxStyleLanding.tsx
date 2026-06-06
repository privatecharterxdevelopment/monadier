import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LandingNav from './LandingNav';
import LandingProductPreview from './LandingProductPreview';
import LandingPartnerLogos from './LandingPartnerLogos';
import LandingFaqSection from './LandingFaqSection';
import LandingFooter from './LandingFooter';
import { getAppUrl } from '../../lib/appUrls';

const heroReveal = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

const HERO_MID_LINES = [
  'on GMX liquidity',
  'with automated perps',
  'with hedge-fund signals',
  'on Arbitrum',
  'with an AI agent that performs',
  'directly on blockchain',
] as const;

const HERO_MID_LONGEST = HERO_MID_LINES.reduce((a, b) => (a.length >= b.length ? a : b));

const ROTATE_MS = 3200;

const GmxStyleLanding: React.FC = () => {
  const [midIndex, setMidIndex] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMidIndex((i) => (i + 1) % HERO_MID_LINES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const midLine = HERO_MID_LINES[midIndex];

  return (
    <div className="landing-gmx">
      <LandingNav variant="light" layout="gmx" />

      <section className="landing-gmx-hero">
        <div className="landing-gmx-hero-shell">
          <div className="landing-gmx-hero-stage">
            <div className="landing-gmx-hero-stack">
              <div className="landing-gmx-hero-title" data-hero-version="static-3-rows">
                <div className="landing-gmx-hero-lines">
                  <div className="landing-gmx-hero-line landing-gmx-hero-line--dark">Trade</div>
                  <div className="landing-gmx-hero-line landing-gmx-hero-line--rotate" aria-live="polite">
                    <span className="landing-gmx-hero-line--rotate-sizer" aria-hidden>
                      {HERO_MID_LONGEST}
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={midLine}
                        className="landing-gmx-hero-line landing-gmx-hero-line--muted landing-gmx-hero-line--rotate-visible"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {midLine}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                  <div className="landing-gmx-hero-line landing-gmx-hero-line--dark">from your vault</div>
                </div>
              </div>
              <motion.div {...heroReveal(0.1)} className="landing-gmx-hero-bottom">
                <div className="landing-gmx-hero-bottom-left">
                  <div className="landing-gmx-hero-cta">
                    <a href={getAppUrl('/register')} className="landing-gmx-btn-primary">
                      Open app
                      <ArrowRight size={16} />
                    </a>
                  </div>
                  <p className="landing-gmx-hero-lead">
                    Decentralised permissionless on-chain trading with deep GMX liquidity and a
                    non-custodial vault — live on Arbitrum.
                  </p>
                </div>
                <div className="landing-gmx-hero-stats">
                  <div className="landing-gmx-hero-stat">
                    <div className="landing-gmx-hero-stat-value">24/7</div>
                    <div className="landing-gmx-hero-stat-label">Bot uptime</div>
                  </div>
                  <div className="landing-gmx-hero-stat">
                    <div className="landing-gmx-hero-stat-value">GMX</div>
                    <div className="landing-gmx-hero-stat-label">Execution</div>
                  </div>
                  <div className="landing-gmx-hero-stat">
                    <div className="landing-gmx-hero-stat-value">V11</div>
                    <div className="landing-gmx-hero-stat-label">Vault</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <LandingProductPreview />
      <LandingPartnerLogos />
      <LandingFaqSection />
      <LandingFooter />
    </div>
  );
};

export default GmxStyleLanding;
