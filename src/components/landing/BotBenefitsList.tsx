import React from 'react';
import { motion } from 'framer-motion';
import { TRADING_BOT_BENEFITS } from '../../lib/seo/tradingBotContent';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const BotBenefitsList: React.FC = () => (
  <motion.section {...fadeUp(0)} className="landing-betting-benefits" aria-labelledby="bot-benefits-title">
    <h2 id="bot-benefits-title" className="landing-betting-benefits-title">
      Why use the Monadier trading bot
    </h2>
    <p className="landing-betting-benefits-lead">
      Full auto Hyperliquid perpetuals — non-custodial funds, 200+ markets, server-side execution
      while your browser is closed.
    </p>
    <ul className="landing-betting-benefits-list">
      {TRADING_BOT_BENEFITS.map((item, i) => (
        <li key={item.title} className="landing-betting-benefits-item">
          <div className="landing-betting-benefits-row">
            <h3 className="landing-betting-benefits-name">{item.title}</h3>
            <p className="landing-betting-benefits-text">{item.text}</p>
          </div>
          {i < TRADING_BOT_BENEFITS.length - 1 ? (
            <div className="landing-betting-benefits-rule" aria-hidden />
          ) : null}
        </li>
      ))}
    </ul>
  </motion.section>
);

export default BotBenefitsList;
