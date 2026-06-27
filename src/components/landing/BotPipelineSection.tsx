import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import {
  BOT_ARCHITECTURE_FEATURES,
  BOT_ARCHITECTURE_GOAL,
  BOT_ARCHITECTURE_LEAD,
  BOT_ARCHITECTURE_TITLE,
} from '../../lib/marketingBotArchitecture';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const BotPipelineSection: React.FC = () => (
  <section
    className="landing-gmx-gutter landing-bot-engine-section"
    aria-labelledby="bot-pipeline-title"
  >
    <div className="landing-gmx-shell landing-bot-engine-shell">
      <motion.header {...fadeUp(0)} className="landing-bot-engine-head">
        <p className="landing-bot-engine-eyebrow">Trading engine</p>
        <h2 id="bot-pipeline-title" className="landing-bot-engine-title">
          {BOT_ARCHITECTURE_TITLE}
        </h2>
        <p className="landing-bot-engine-lead">{BOT_ARCHITECTURE_LEAD}</p>
      </motion.header>

      <ul className="landing-bot-engine-grid">
        {BOT_ARCHITECTURE_FEATURES.map((feature, i) => (
          <motion.li
            key={feature}
            {...fadeUp(0.03 + i * 0.015)}
            className="landing-bot-engine-item landing-glass-card"
          >
            <span className="landing-bot-engine-item-num" aria-hidden>
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="landing-bot-engine-item-text">{feature}</p>
          </motion.li>
        ))}
      </ul>

      <motion.div {...fadeUp(0.12)} className="landing-bot-engine-goal landing-glass-card">
        <p className="landing-bot-engine-goal-text">{BOT_ARCHITECTURE_GOAL}</p>
      </motion.div>

      <motion.div {...fadeUp(0.14)} className="landing-bot-engine-links">
        <Link to="/technology" className="landing-bot-engine-link">
          Full technology stack
          <ArrowRight size={14} aria-hidden />
        </Link>
        <Link to="/pricing" className="landing-bot-engine-link landing-bot-engine-link--muted">
          Fees & pricing
          <ArrowRight size={14} aria-hidden />
        </Link>
      </motion.div>
    </div>
  </section>
);

export default BotPipelineSection;
