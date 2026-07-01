import React from 'react';
import { motion } from 'framer-motion';
import { Radar, ShieldCheck, TrendingUp } from 'lucide-react';
import { TRADING_BOT_CAPABILITIES } from '../../lib/seo/tradingBotContent';

const ICONS = {
  scan: Radar,
  shield: ShieldCheck,
  trend: TrendingUp,
} as const;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const BotCapabilityCards: React.FC = () => (
  <section
    className="landing-gmx-gutter landing-bot-capability-section"
    aria-labelledby="bot-capability-title"
  >
    <div className="landing-gmx-shell landing-bot-capability-shell">
      <motion.div {...fadeUp(0)} className="landing-bot-capability-head">
        <h2 id="bot-capability-title" className="landing-bot-capability-title">
          What the bot does
        </h2>
        <p className="landing-bot-capability-lead">
          Scan, gate, enter, and trail — without you at the chart.
        </p>
      </motion.div>

      <div className="landing-bot-capability-grid">
        {TRADING_BOT_CAPABILITIES.map((item, i) => {
          const Icon = ICONS[item.icon];
          return (
            <motion.article
              key={item.title}
              {...fadeUp(0.06 + i * 0.05)}
              className={`landing-bot-capability-card landing-glass-card${
                item.icon === 'trend' ? ' landing-bot-capability-card--emerald' : ''
              }`}
            >
              <div className="landing-bot-capability-icon" aria-hidden>
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <h3 className="landing-bot-capability-card-title">{item.title}</h3>
              <p className="landing-bot-capability-card-text">{item.text}</p>
            </motion.article>
          );
        })}
      </div>
    </div>
  </section>
);

export default BotCapabilityCards;
