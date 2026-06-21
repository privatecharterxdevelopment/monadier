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
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

const LandingBotArchitecture: React.FC = () => {
  return (
    <section
      className="landing-gmx-section landing-gmx-architecture"
      aria-labelledby="landing-bot-architecture-title"
    >
      <div className="landing-gmx-container">
        <motion.div {...fadeUp(0)} className="landing-gmx-architecture-head">
          <p className="landing-gmx-architecture-eyebrow">Trading bot</p>
          <h2 id="landing-bot-architecture-title" className="landing-gmx-section-title">
            {BOT_ARCHITECTURE_TITLE}
          </h2>
          <p className="landing-gmx-architecture-lead">{BOT_ARCHITECTURE_LEAD}</p>
        </motion.div>

        <motion.ul {...fadeUp(0.08)} className="landing-gmx-architecture-list">
          {BOT_ARCHITECTURE_FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </motion.ul>

        <motion.p {...fadeUp(0.12)} className="landing-gmx-architecture-goal">
          {BOT_ARCHITECTURE_GOAL}
        </motion.p>

        <motion.div {...fadeUp(0.16)} className="landing-gmx-architecture-links">
          <Link to="/technology" className="landing-gmx-architecture-link">
            Technology
            <ArrowRight size={14} />
          </Link>
          <Link to="/trading-bot" className="landing-gmx-architecture-link">
            Bot details
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

export default LandingBotArchitecture;
