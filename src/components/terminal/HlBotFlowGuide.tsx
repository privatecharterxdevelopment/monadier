import React from 'react';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';

const STEPS = [
  {
    title: 'Connect wallet',
    body: 'Use the same wallet as on Hyperliquid — the bot trades on your HL account.',
  },
  {
    title: 'Deposit USDC',
    body: `In the Bot panel, deposit USDC from Arbitrum to Hyperliquid (min. $${MIN_HL_BOT_USD}). All in Monadier — no site switch.`,
  },
  {
    title: 'Approve agent',
    body: 'One-time signature on Hyperliquid. The agent can trade only — not withdraw.',
  },
  {
    title: 'Start bot',
    body: 'Monadier scans all HL markets 24/7, opens the best setup, closes at TP/SL, then finds the next.',
  },
] as const;

/** Shown once during profile onboarding — static getting-started guide. */
const HlBotFlowGuide: React.FC = () => (
  <div className="hl-bot-flow hl-bot-flow--onboarding">
    <span className="term-panel-card-label">How to start the bot</span>
    <ol className="hl-bot-flow__list">
      {STEPS.map((step, i) => (
        <li key={step.title} className="hl-bot-flow__step">
          <span className="hl-bot-flow__num">{i + 1}</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  </div>
);

export default HlBotFlowGuide;
