import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { TRADING_BOT_FAQS } from '../../lib/seo/tradingBotContent';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] },
});

const BotFaqSection: React.FC = () => {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <section
      className="landing-gmx-gutter landing-bot-faq-section"
      aria-labelledby="bot-faq-title"
    >
      <div className="landing-gmx-shell landing-bot-faq-shell">
        <motion.header {...fadeUp(0)} className="landing-bot-faq-head">
          <h2 id="bot-faq-title" className="landing-bot-faq-title">
            Trading agent FAQ
          </h2>
          <p className="landing-bot-faq-lead">
            Setup, fees, non-custodial funds, and 24/7 automation on Hyperliquid.
          </p>
        </motion.header>

        <div className="landing-betting-faq-grid">
          {TRADING_BOT_FAQS.map((item, i) => {
            const isOpen = openKey === item.q;
            const panelId = `bot-faq-panel-${i}`;
            const buttonId = `bot-faq-button-${i}`;

            return (
              <motion.div
                key={item.q}
                {...fadeUp(0.04 + i * 0.02)}
                className={`landing-betting-faq-item${isOpen ? ' landing-betting-faq-item--open' : ''}`}
              >
                <button
                  type="button"
                  id={buttonId}
                  className="landing-betting-faq-q"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenKey((prev) => (prev === item.q ? null : item.q))}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={18} className="landing-betting-faq-chevron" aria-hidden />
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="landing-betting-faq-panel"
                  hidden={!isOpen}
                >
                  <p className="landing-betting-faq-a">{item.a}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BotFaqSection;
