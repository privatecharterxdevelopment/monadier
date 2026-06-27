import React from 'react';
import { motion } from 'framer-motion';
import { TRADING_BOT_FEATURES } from '../../lib/seo/tradingBotContent';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const QUICK_FACTS = [
  { label: 'Min. balance', value: '$20 USDC' },
  { label: 'Success fee', value: '10% on wins' },
  { label: 'Platform fee', value: 'No subscription' },
  { label: 'Arbitrum gas', value: 'Covered by Monadier' },
] as const;

const BotDetailsSection: React.FC = () => (
  <>
    <motion.div {...fadeUp(0)} className="landing-bot-quick-facts" aria-label="Bot quick facts">
      {QUICK_FACTS.map((fact) => (
        <div key={fact.label} className="landing-bot-quick-fact landing-glass-card">
          <span className="landing-bot-quick-fact-label">{fact.label}</span>
          <span className="landing-bot-quick-fact-value">{fact.value}</span>
        </div>
      ))}
    </motion.div>

    <motion.section {...fadeUp(0.04)} className="landing-bot-features" aria-labelledby="bot-features-title">
      <h2 id="bot-features-title" className="landing-bot-features-title">
        What the bot does for you
      </h2>
      <p className="landing-bot-features-lead">
        Signal scanning, risk gates, and execution — built into one terminal alongside manual Pro Trade.
      </p>
      <ul className="landing-bot-features-grid">
        {TRADING_BOT_FEATURES.map((item) => (
          <li key={item.title} className="landing-bot-features-item landing-glass-card">
            <h3 className="landing-bot-features-name">{item.title}</h3>
            <p className="landing-bot-features-text">{item.text}</p>
          </li>
        ))}
      </ul>
    </motion.section>
  </>
);

export default BotDetailsSection;
