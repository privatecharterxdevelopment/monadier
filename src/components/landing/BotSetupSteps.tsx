import React from 'react';
import { motion } from 'framer-motion';
import {
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingSectionHeading,
} from '../marketing/MarketingInnerPage';
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

const BotSetupSteps: React.FC = () => (
  <motion.div {...fadeUp(0.04)}>
    <MarketingSectionHeading
      title="Get started in three steps"
      sub="From wallet connect to 24/7 automated trading on Hyperliquid."
    />
    <MarketingPageGrid columns={3}>
      {STEPS.map((step, i) => (
        <MarketingFeatureCard
          key={step.title}
          index={i}
          title={step.title}
          text={step.text}
          visual={step.visual}
        />
      ))}
    </MarketingPageGrid>
  </motion.div>
);

export default BotSetupSteps;
