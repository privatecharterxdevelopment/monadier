import React from 'react';
import { motion } from 'framer-motion';
import { BETTING_BENEFITS } from '../../lib/seo/bettingContent';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const BettingBenefitsList: React.FC = () => (
  <motion.section {...fadeUp(0)} className="landing-betting-benefits" aria-labelledby="betting-benefits-title">
    <h2 id="betting-benefits-title" className="landing-betting-benefits-title">
      Why bet on Hyperliquid with Monadier
    </h2>
    <p className="landing-betting-benefits-lead">
      On-chain sports betting and prediction markets — non-custodial, transparent odds, one platform
      with our Hyperliquid trading bot.
    </p>
    <ul className="landing-betting-benefits-list">
      {BETTING_BENEFITS.map((item, i) => (
        <li key={item.title} className="landing-betting-benefits-item">
          <div className="landing-betting-benefits-row">
            <h3 className="landing-betting-benefits-name">{item.title}</h3>
            <p className="landing-betting-benefits-text">{item.text}</p>
          </div>
          {i < BETTING_BENEFITS.length - 1 ? (
            <div className="landing-betting-benefits-rule" aria-hidden />
          ) : null}
        </li>
      ))}
    </ul>
  </motion.section>
);

export default BettingBenefitsList;
