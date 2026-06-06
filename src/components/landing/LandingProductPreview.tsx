import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { getAppUrl } from '../../lib/appUrls';

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
      <div className="landing-gmx-container landing-gmx-preview-inner">
        <motion.div {...fadeUp(0)} className="landing-gmx-preview-copy">
          <p className="landing-gmx-preview-eyebrow">Product preview</p>
          <h2 id="landing-preview-title" className="landing-gmx-preview-title">
            GMX automated trading terminal — ready on day one
          </h2>
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
          <a href={getAppUrl('/register')} className="landing-gmx-btn-primary landing-gmx-preview-cta">
            Start trading
            <ArrowRight size={16} />
          </a>
        </motion.div>

        <motion.div {...fadeUp(0.08)} className="landing-gmx-preview-stage">
          <div className="landing-gmx-preview-glow" aria-hidden />
          <motion.div
            className="landing-gmx-preview-frame-wrap"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="landing-gmx-preview-frame">
              <div className="landing-gmx-preview-chrome">
                <div className="landing-gmx-preview-dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-gmx-preview-url">app.monadier.com/dashboard</div>
              </div>
              <div className="landing-gmx-preview-screen">
                <img
                  src="/images/dashboard-preview.png"
                  alt="Monadier GMX trading bot dashboard on Arbitrum with live ETH chart, automated bot panel, and perpetual trade history"
                  className="landing-gmx-preview-img"
                  width={PREVIEW_NATIVE_W}
                  height={PREVIEW_NATIVE_H}
                  decoding="async"
                  fetchPriority="high"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default LandingProductPreview;
