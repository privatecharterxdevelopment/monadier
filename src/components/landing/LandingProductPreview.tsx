import React from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import OpenAppLink from '../layout/OpenAppLink';
import {
  dashboardPreview,
  DASHBOARD_PREVIEW_HEIGHT,
  DASHBOARD_PREVIEW_WIDTH,
} from '../../assets/landing/dashboardPreview';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

const PREVIEW_CHIPS = [
  'Hyperliquid perps',
  '24/7 trading bot',
  'USDC on HL',
  'Live charts',
] as const;

const LandingProductPreview: React.FC = () => {
  return (
    <section
      className="landing-gmx-section landing-gmx-gutter landing-gmx-preview-section"
      aria-labelledby="landing-preview-title"
    >
      <div className="landing-gmx-shell">
        <motion.h2
          {...fadeUp(0)}
          id="landing-preview-title"
          className="landing-gmx-section-hero-title"
        >
          AI Agent that actually performs
        </motion.h2>

        <div className="landing-gmx-preview-inner">
          <motion.div {...fadeUp(0.04)} className="landing-gmx-preview-copy">
            <p className="landing-gmx-preview-lead">
              One workspace for Hyperliquid charts, automated bot controls, USDC funding, and trade
              history — algorithmic perp trading without switching apps.
            </p>
            <div className="landing-gmx-preview-chips" aria-hidden>
              {PREVIEW_CHIPS.map((chip) => (
                <span key={chip} className="landing-gmx-preview-chip">
                  {chip}
                </span>
              ))}
            </div>
            <OpenAppLink className="landing-gmx-btn-primary landing-gmx-preview-cta">
              Open Pro Trade
              <ArrowRight size={16} />
            </OpenAppLink>
          </motion.div>

          <motion.div
            className="landing-gmx-preview-stage"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="landing-gmx-preview-glow" aria-hidden />
            <div className="landing-gmx-preview-frame-wrap">
              <div className="landing-gmx-preview-frame">
                <div className="landing-gmx-preview-chrome">
                  <div className="landing-gmx-preview-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="landing-gmx-preview-url">app.hypergain.io</div>
                </div>
                <div
                  className="landing-gmx-preview-screen"
                  style={{
                    aspectRatio: `${DASHBOARD_PREVIEW_WIDTH} / ${DASHBOARD_PREVIEW_HEIGHT}`,
                  }}
                >
                  <img
                    src={dashboardPreview}
                    alt="HyperGain Hyperliquid trading terminal with live BTC chart, automated bot panel, and trade history"
                    className="landing-gmx-preview-img"
                    width={DASHBOARD_PREVIEW_WIDTH}
                    height={DASHBOARD_PREVIEW_HEIGHT}
                    sizes="(max-width: 1200px) 92vw, 1100px"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default LandingProductPreview;
