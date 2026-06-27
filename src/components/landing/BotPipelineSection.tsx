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

const BotPipelineSection: React.FC = () => (
  <motion.section {...fadeUp(0.06)} className="landing-bot-pipeline" aria-labelledby="bot-pipeline-title">
    <div className="landing-gmx-architecture-head">
      <p className="landing-gmx-architecture-eyebrow">Trading engine</p>
      <h2 id="bot-pipeline-title" className="landing-gmx-section-title">
        {BOT_ARCHITECTURE_TITLE}
      </h2>
      <p className="landing-gmx-architecture-lead">{BOT_ARCHITECTURE_LEAD}</p>
    </div>

    <ul className="landing-gmx-architecture-list">
      {BOT_ARCHITECTURE_FEATURES.map((feature) => (
        <li key={feature}>{feature}</li>
      ))}
    </ul>

    <p className="landing-gmx-architecture-goal">{BOT_ARCHITECTURE_GOAL}</p>

    <div className="landing-gmx-architecture-links">
      <Link to="/technology" className="landing-gmx-architecture-link">
        Full technology stack
        <ArrowRight size={14} />
      </Link>
      <Link to="/pricing" className="landing-gmx-architecture-link">
        Fees & pricing
        <ArrowRight size={14} />
      </Link>
    </div>
  </motion.section>
);

export default BotPipelineSection;
