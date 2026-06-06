import React from 'react';
import { motion } from 'framer-motion';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

const PREVIEW_CHIPS = [
  'GMX perps',
  'Auto-trading bot',
  'Arbitrum vault',
  'Live charts',
] as const;

/** Native asset is 1024×467 — do not upscale beyond that width */
const PREVIEW_NATIVE_W = 1024;
const PREVIEW_NATIVE_H = 467;

const LandingProductPreview: React.FC = () => {
  return (
    <section
      className="landing-gmx-section landing-gmx-preview-section"
      aria-labelledby="landing-preview-title"
    >
      <div className="landing-gmx-container">
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
              One Arbitrum workspace for live charts, bot controls, USDC vault funding, and trade
              history. Algorithmic crypto trading on GMX perpetuals without switching tools.
            </p>
            <div className="landing-gmx-preview-chips" aria-hidden>
              {PREVIEW_CHIPS.map((chip) => (
                <span key={chip} className="landing-gmx-preview-chip">
                  {chip}
                </span>
              ))}
            </div>
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
                  <div className="landing-gmx-preview-url">app.monadier.com/dashboard</div>
                </div>
                <div
                  className="landing-gmx-preview-screen"
                  style={{ aspectRatio: `${PREVIEW_NATIVE_W} / ${PREVIEW_NATIVE_H}` }}
                >
                  <img
                    src="/images/dashboard-preview.png"
                    alt="Monadier GMX trading bot dashboard on Arbitrum with live ETH chart, automated bot panel, and perpetual trade history"
                    className="landing-gmx-preview-img"
                    width={PREVIEW_NATIVE_W}
                    height={PREVIEW_NATIVE_H}
                    sizes="(max-width: 1024px) 92vw, 1024px"
                    loading="eager"
                    decoding="sync"
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
