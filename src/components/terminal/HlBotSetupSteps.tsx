import React from 'react';
import { Check } from 'lucide-react';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';
import { formatBuilderFeeLabel } from '../../lib/hyperliquid/builderConfig';

type Props = {
  walletReady: boolean;
  hlBalanceUsd: number;
  agentApproved: boolean;
  builderFeeApproved: boolean;
  builderFeeEnabled: boolean;
  botRunning: boolean;
  currentStep: 1 | 2 | 3 | 4 | 5;
  variant?: 'progress' | 'guide';
};

function buildSteps(builderFeeEnabled: boolean) {
  const feeLabel = formatBuilderFeeLabel(
    Number(import.meta.env.VITE_HL_BUILDER_FEE_PERP || 30)
  );
  const base = [
    { n: 1 as const, title: 'Connect wallet', body: 'Same wallet as on Hyperliquid.' },
    {
      n: 2 as const,
      title: 'Deposit USDC',
      body: `Min $${MIN_HL_BOT_USD} on HL — in Monadier, no site switch.`,
    },
    { n: 3 as const, title: 'Approve agent', body: 'One-time — trade only, no withdrawals.' },
  ];
  if (builderFeeEnabled) {
    base.push({
      n: 4 as const,
      title: 'Approve platform fee',
      body: `One-time HL signature (${feeLabel} perp fee). Required for bot orders.`,
    });
  }
  base.push({
    n: (builderFeeEnabled ? 5 : 4) as 4 | 5,
    title: 'Start bot',
    body: 'Runs 24/7 until you stop it.',
  });
  return base;
}

function stepDone(
  n: number,
  walletReady: boolean,
  hlBalanceUsd: number,
  agentApproved: boolean,
  builderFeeApproved: boolean,
  builderFeeEnabled: boolean,
  botRunning: boolean
): boolean {
  if (n === 1) return walletReady;
  if (n === 2) return hlBalanceUsd >= MIN_HL_BOT_USD;
  if (n === 3) return agentApproved;
  if (builderFeeEnabled && n === 4) return builderFeeApproved;
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
  const steps = buildSteps(builderFeeEnabled);
  return (
    <ol
      className={`hl-bot-setup-steps${
        variant === 'guide' ? ' hl-bot-setup-steps--guide' : ''
      }`}
    >
      {steps.map((step) => {
        const showProgress = variant === 'progress';
        const done = showProgress
          ? stepDone(
              step.n,
              walletReady,
              hlBalanceUsd,
              agentApproved,
              builderFeeApproved,
              builderFeeEnabled,
              botRunning
            )
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
