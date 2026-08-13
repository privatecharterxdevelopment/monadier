import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import LandingBotCalculatorWidget from './widgets/LandingBotCalculatorWidget';
import LandingBotAiVisual from './widgets/LandingBotAiVisual';
import LandingPerpsVisual from './widgets/LandingPerpsVisual';
import { TRADING_BOT_FEATURES } from '../../lib/seo/tradingBotContent';
import { goToOpenApp } from '../../lib/appUrls';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const PILLARS = ['Estimate', 'Automate', 'Execute'] as const;

const FEATURES = [
  {
    title: 'Full auto 24/7',
    text: 'Scans 200+ HL perps every cycle — no manual chart watching.',
    visual: <LandingBotAiVisual />,
  },
  {
    title: 'Non-custodial',
    text: 'USDC stays on your Hyperliquid account. You control deposits and withdrawals.',
    visual: (
      <div className="landing-bot-estimate-hl-badge" aria-hidden>
        HL
      </div>
    ),
  },
  {
    title: 'Multi-timeframe',
    text: '5m–1h signals rank the strongest setup before each open.',
    visual: <LandingPerpsVisual />,
  },
] as const;

const QUICK_FACTS = [
  { label: 'Min. balance', value: '$20 USDC' },
  { label: 'HyperGain fee', value: 'None on closes' },
  { label: 'Platform fee', value: 'No subscription' },
  { label: 'Arbitrum gas', value: 'Covered by HyperGain' },
] as const;

const BotEstimateSection: React.FC = () => (
  <section
    className="landing-gmx-gutter landing-bot-estimate-section"
    aria-labelledby="bot-estimate-title"
  >
    <div className="landing-gmx-shell landing-bot-estimate-shell">
      <motion.header {...fadeUp(0)} className="landing-bot-estimate-head">
        <h2 id="bot-estimate-title" className="landing-bot-estimate-title">
          Estimate · automate · execute
        </h2>
        <p className="landing-bot-estimate-lead">
          ROI calculator, live markets, and full auto bot — same terminal, one HL account.
        </p>
      </motion.header>

      <motion.div {...fadeUp(0.03)} className="landing-bot-estimate-pillars" aria-hidden>
        {PILLARS.map((label, i) => (
          <span key={label} className="landing-bot-estimate-pillar">
            <span className="landing-bot-estimate-pillar-num">{String(i + 1).padStart(2, '0')}</span>
            {label}
          </span>
        ))}
      </motion.div>

      <div className="landing-bot-estimate-layout">
        <motion.div {...fadeUp(0.05)} className="landing-bot-estimate-calc landing-glass-card">
          <LandingBotCalculatorWidget />
        </motion.div>

        <motion.ul {...fadeUp(0.07)} className="landing-bot-estimate-features">
          {FEATURES.map((item) => (
            <li key={item.title} className="landing-bot-estimate-feature landing-glass-card">
              <div className="landing-bot-estimate-feature-visual">{item.visual}</div>
              <div className="landing-bot-estimate-feature-body">
                <h3 className="landing-bot-estimate-feature-title">{item.title}</h3>
                <p className="landing-bot-estimate-feature-text">{item.text}</p>
              </div>
            </li>
          ))}
        </motion.ul>

        <motion.div
          {...fadeUp(0.09)}
          className="landing-bot-estimate-spotlight landing-glass-card"
        >
          <div className="landing-bot-estimate-spotlight-media" aria-hidden>
            <img
              src="/images/landing/landing-carousel-bot-brain.png"
              alt=""
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="landing-bot-estimate-spotlight-body">
            <p className="landing-bot-estimate-spotlight-eyebrow">How it works</p>
            <p className="landing-bot-estimate-spotlight-text">
              Connect wallet → fund HL with USDC on Arbitrum → approve agent → Start agent. The server
              scans, opens, trails profit, and cuts losers.
            </p>
            <button
              type="button"
              className="landing-bot-estimate-spotlight-cta"
              onClick={() => goToOpenApp('?section=bot', false)}
            >
              Start agent
              <ArrowRight size={15} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </motion.div>
      </div>

      <motion.div {...fadeUp(0.11)} className="landing-bot-estimate-does">
        <header className="landing-bot-estimate-does-head">
          <h3 id="bot-features-title" className="landing-bot-estimate-does-title">
            What the agent does for you
          </h3>
          <p className="landing-bot-estimate-does-lead">
            Signal scanning, risk gates, and execution — built into one terminal alongside manual Pro Trade.
          </p>
        </header>

        <div className="landing-bot-estimate-does-facts" aria-label="Bot quick facts">
          {QUICK_FACTS.map((fact) => (
            <div key={fact.label} className="landing-bot-estimate-fact landing-glass-card">
              <span className="landing-bot-estimate-fact-label">{fact.label}</span>
              <span className="landing-bot-estimate-fact-value">{fact.value}</span>
            </div>
          ))}
        </div>

        <ul className="landing-bot-estimate-does-grid">
          {TRADING_BOT_FEATURES.map((item, i) => (
            <li key={item.title} className="landing-bot-estimate-does-item landing-glass-card">
              <span className="landing-bot-estimate-does-item-num" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="landing-bot-estimate-does-item-body">
                <h4 className="landing-bot-estimate-does-item-title">{item.title}</h4>
                <p className="landing-bot-estimate-does-item-text">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  </section>
);

export default BotEstimateSection;
