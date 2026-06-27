import React from 'react';
import { motion } from 'framer-motion';
import {
  MktWalletVisual,
  MktDepositVisual,
  MktAgentApproveVisual,
} from '../marketing/MarketingIllustrations';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

const STEPS = [
  {
    title: 'Connect wallet',
    text: 'Sign in with your wallet on Arbitrum One. Monadier only needs Arbitrum — USDC deposits route to Hyperliquid.',
    visual: <MktWalletVisual />,
  },
  {
    title: 'Fund Hyperliquid',
    text: 'Deposit at least $20 USDC to your HL account (HL minimum is $5). Funds stay in your name on Hyperliquid.',
    visual: <MktDepositVisual />,
  },
  {
    title: 'Approve & start',
    text: 'One-time agent approval lets the bot place trades — not withdraw. Set TP/SL, optional leverage, then press Start bot.',
    visual: <MktAgentApproveVisual />,
  },
] as const;

const BotSetupStepsSection: React.FC = () => (
  <section
    className="landing-gmx-gutter landing-bot-setup-section"
    aria-labelledby="bot-setup-title"
  >
    <div className="landing-gmx-shell landing-bot-setup-shell">
      <motion.header {...fadeUp(0)} className="landing-bot-setup-head">
        <h2 id="bot-setup-title" className="landing-bot-setup-title">
          Get started in three steps
        </h2>
        <p className="landing-bot-setup-lead">
          From wallet connect to 24/7 automated trading on Hyperliquid.
        </p>
      </motion.header>

      <ol className="landing-bot-setup-track">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            {...fadeUp(0.04 + i * 0.04)}
            className="landing-bot-setup-step landing-glass-card"
          >
            <span className="landing-bot-setup-step-index" aria-hidden>
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="landing-bot-setup-step-visual">{step.visual}</div>
            <h3 className="landing-bot-setup-step-title">{step.title}</h3>
            <p className="landing-bot-setup-step-text">{step.text}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  </section>
);

export default BotSetupStepsSection;
