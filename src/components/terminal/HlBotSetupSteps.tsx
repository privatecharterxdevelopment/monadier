import React from 'react';
import { Check } from 'lucide-react';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';

type Props = {
  walletReady: boolean;
  hlBalanceUsd: number;
  agentApproved: boolean;
  botRunning: boolean;
  currentStep: 1 | 2 | 3 | 4;
  /** Inline first-time guide shows progress; modal uses neutral static list. */
  variant?: 'progress' | 'guide';
};

const STEPS = [
  { n: 1, title: 'Connect wallet', body: 'Same wallet as on Hyperliquid.' },
  {
    n: 2,
    title: 'Deposit USDC',
    body: `Min $${MIN_HL_BOT_USD} on HL — in Monadier, no site switch.`,
  },
  { n: 3, title: 'Approve agent', body: 'One-time — trade only, no withdrawals.' },
  { n: 4, title: 'Start bot', body: 'Runs 24/7 until you stop it.' },
] as const;

function stepDone(
  n: number,
  walletReady: boolean,
  hlBalanceUsd: number,
  agentApproved: boolean,
  botRunning: boolean
): boolean {
  if (n === 1) return walletReady;
  if (n === 2) return hlBalanceUsd >= MIN_HL_BOT_USD;
  if (n === 3) return agentApproved;
  return botRunning;
}

const HlBotSetupSteps: React.FC<Props> = ({
  walletReady,
  hlBalanceUsd,
  agentApproved,
  botRunning,
  currentStep,
  variant = 'progress',
}) => (
  <ol
    className={`hl-bot-setup-steps${
      variant === 'guide' ? ' hl-bot-setup-steps--guide' : ''
    }`}
  >
    {STEPS.map((step) => {
      const showProgress = variant === 'progress';
      const done = showProgress
        ? stepDone(step.n, walletReady, hlBalanceUsd, agentApproved, botRunning)
        : false;
      const active = showProgress && step.n === currentStep && !done;
      return (
        <li
          key={step.n}
          className={`hl-bot-setup-step${done ? ' hl-bot-setup-step--done' : ''}${
            active ? ' hl-bot-setup-step--active' : ''
          }`}
        >
          <span className="hl-bot-setup-step__mark" aria-hidden>
            {done ? <Check size={12} strokeWidth={3} /> : step.n}
          </span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.body}</p>
          </div>
        </li>
      );
    })}
  </ol>
);

export default HlBotSetupSteps;
