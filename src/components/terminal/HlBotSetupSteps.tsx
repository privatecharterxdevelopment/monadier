import React from 'react';
import { Check } from 'lucide-react';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';
import {
  hlBotSuccessFeeApprovalDescription,
  hlBotSuccessFeeShortLabel,
} from '../../lib/hyperliquid/hlBotSuccessFee';

type Props = {
  walletReady: boolean;
  hlBalanceUsd: number;
  agentApproved: boolean;
  builderFeeApproved: boolean;
  builderFeeEnabled: boolean;
  botRunning: boolean;
  currentStep: 1 | 2 | 3;
  variant?: 'progress' | 'guide';
};

const STEPS = [
  { n: 1, title: 'Connect wallet', body: 'Same wallet as on Hyperliquid.' },
  {
    n: 2,
    title: 'Deposit USDC',
    body: `Only native USDC on Arbitrum One (not BNB or other chains). Deposit in HyperGain — min $${MIN_HL_BOT_USD} for the bot.`,
  },
  {
    n: 3,
    title: 'Approvals & start',
    body: 'Approve trading agent, then platform fee (two wallet signatures), then Start bot.',
  },
] as const;

function stepBody(
  step: (typeof STEPS)[number],
  hlBalanceUsd: number,
  builderFeeEnabled: boolean
): string {
  if (step.n === 2 && hlBalanceUsd >= MIN_HL_BOT_USD) {
    return `HL balance $${hlBalanceUsd.toFixed(2)} — funded (min $${MIN_HL_BOT_USD}). Native USDC on Arbitrum only.`;
  }
  if (step.n === 3 && hlBalanceUsd >= MIN_HL_BOT_USD) {
    const feeNote = builderFeeEnabled
      ? ` Approve ${hlBotSuccessFeeShortLabel()} before Start bot.`
      : '';
    return `Balance funded — approve trading agent${feeNote} Agent allows trading only (no withdrawals).`;
  }
  if (step.n === 3 && builderFeeEnabled) {
    return `Approve trading agent, then ${hlBotSuccessFeeShortLabel()}, then Start bot. ${hlBotSuccessFeeApprovalDescription()}`;
  }
  return step.body;
}

function stepDone(
  n: number,
  walletReady: boolean,
  hlBalanceUsd: number,
  botRunning: boolean
): boolean {
  if (n === 1) return walletReady;
  if (n === 2) return hlBalanceUsd >= MIN_HL_BOT_USD;
  return botRunning;
}

const HlBotSetupSteps: React.FC<Props> = ({
  walletReady,
  hlBalanceUsd,
  agentApproved,
  builderFeeApproved,
  builderFeeEnabled,
  botRunning,
  currentStep,
  variant = 'progress',
}) => {
  const steps = STEPS.map((s) => ({
    ...s,
    body: stepBody(s, hlBalanceUsd, builderFeeEnabled),
  }));

  return (
    <ol
      className={`hl-bot-setup-steps${
        variant === 'guide' ? ' hl-bot-setup-steps--guide' : ''
      }`}
    >
      {steps.map((step) => {
        const showProgress = variant === 'progress';
        const done = showProgress
          ? stepDone(step.n, walletReady, hlBalanceUsd, botRunning)
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
};

export default HlBotSetupSteps;
