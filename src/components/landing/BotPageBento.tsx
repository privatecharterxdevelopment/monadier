import React from 'react';
import { motion } from 'framer-motion';
import LandingAppleFeatureWidget from './widgets/LandingAppleFeatureWidget';
import LandingBotCalculatorWidget from './widgets/LandingBotCalculatorWidget';
import LandingBotAiVisual from './widgets/LandingBotAiVisual';
import LandingPerpsVisual from './widgets/LandingPerpsVisual';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const COMPACT_TILES = [
  {
    title: 'Full auto 24/7',
    desc: 'Scans 200+ HL perps every cycle — no manual chart watching.',
    tone: 'dark' as const,
    visual: <LandingBotAiVisual />,
  },
  {
    title: 'Non-custodial',
    desc: 'USDC stays on your Hyperliquid account. You control deposits and withdrawals.',
    tone: 'light' as const,
    visual: (
      <div className="landing-bot-bento-icon" aria-hidden>
        <span>HL</span>
      </div>
    ),
  },
  {
    title: 'Multi-timeframe',
    desc: '1m–1h signals rank the strongest setup before each open.',
    tone: 'light' as const,
    visual: <LandingPerpsVisual />,
  },
];

const BotPageBento: React.FC = () => (
  <section
    className="landing-gmx-gutter landing-home-bento-section landing-bot-page-bento"
    aria-labelledby="landing-bot-bento-title"
  >
    <div className="landing-home-bento-container">
      <motion.header {...fadeUp(0)} className="landing-home-bento-header">
        <div className="landing-home-bento-header-main">
          <h2 id="landing-bot-bento-title" className="landing-home-bento-title">
            Estimate · automate · execute
          </h2>
        </div>
        <p className="landing-home-bento-sub">
          ROI calculator, live markets, and full auto bot — same terminal, one HL account.
        </p>
      </motion.header>

      <div className="landing-apple-widgets-bento">
        <div className="landing-apple-widgets-stack">
          <motion.div {...fadeUp(0.04)} className="landing-apple-widgets-cell landing-apple-widgets-cell--calc">
            <LandingBotCalculatorWidget />
          </motion.div>

          <div className="landing-apple-widgets-tiles landing-apple-widgets-tiles--bot">
            {COMPACT_TILES.map((tile, i) => (
              <motion.div key={tile.title} {...fadeUp(0.06 + i * 0.02)} className="landing-apple-widgets-cell">
                <LandingAppleFeatureWidget
                  title={tile.title}
                  desc={tile.desc}
                  cta=""
                  section="?section=bot"
                  tone={tile.tone}
                  visual={tile.visual}
                  hideCta
                />
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div {...fadeUp(0.08)} className="landing-apple-widgets-cell landing-apple-widgets-cell--hero">
          <LandingAppleFeatureWidget
            title="How it works"
            desc="Connect wallet → fund HL with USDC on Arbitrum → approve agent → Start bot. The server scans, opens, trails profit, and cuts losers."
            cta="Start bot"
            section="?section=bot"
            tone="photo"
            image="/images/landing/landing-carousel-bot-brain.png"
            imagePosition="cover"
            layout="hero"
          />
        </motion.div>
      </div>
    </div>
  </section>
);

export default BotPageBento;
