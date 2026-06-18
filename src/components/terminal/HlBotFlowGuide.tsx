import React from 'react';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';
import { HL_APP_URL } from '../../lib/hyperliquid/hlApp';

export type HlBotSetupPhase = 'connect' | 'loading' | 'approve' | 'fund' | 'ready';

type Props = {
  phase: HlBotSetupPhase;
  botRunning: boolean;
  hlBalanceUsd: number;
};

const STEPS = [
  {
    key: 'connect',
    title: 'Wallet verbinden',
    body: 'Dieselbe Wallet wie auf Hyperliquid — der Bot handelt auf deinem HL-Konto.',
  },
  {
    key: 'approve',
    title: 'Agent freigeben',
    body: 'Einmalige Signatur auf Hyperliquid. Der Agent darf nur traden, nicht abheben.',
  },
  {
    key: 'fund',
    title: 'USDC auf Hyperliquid einzahlen',
    body: `Auf app.hyperliquid.xyz einzahlen (min. $${MIN_HL_BOT_USD} für den Bot). Geld liegt auf HL, nicht auf Arbitrum.`,
  },
  {
    key: 'start',
    title: 'Bot starten',
    body: 'Monadier scannt alle HL-Märkte 24/7, öffnet das beste Setup, schließt bei TP/SL und sucht das nächste.',
  },
] as const;

function stepState(
  stepKey: (typeof STEPS)[number]['key'],
  phase: HlBotSetupPhase,
  botRunning: boolean
): 'done' | 'active' | 'pending' {
  if (stepKey === 'connect') {
    if (phase === 'connect') return 'active';
    return 'done';
  }
  if (stepKey === 'approve') {
    if (phase === 'connect' || phase === 'loading') return 'pending';
    if (phase === 'approve') return 'active';
    return 'done';
  }
  if (stepKey === 'fund') {
    if (phase === 'connect' || phase === 'loading' || phase === 'approve') return 'pending';
    if (phase === 'fund') return 'active';
    return 'done';
  }
  if (stepKey === 'start') {
    if (botRunning) return 'done';
    if (phase === 'ready') return 'active';
    return 'pending';
  }
  return 'pending';
}

const HlBotFlowGuide: React.FC<Props> = ({ phase, botRunning, hlBalanceUsd }) => (
  <div className="term-panel-card term-panel-card--muted hl-bot-flow">
    <span className="term-panel-card-label">So startet der Bot</span>
    <ol className="hl-bot-flow__list">
      {STEPS.map((step, i) => {
        const state = stepState(step.key, phase, botRunning);
        return (
          <li
            key={step.key}
            className={`hl-bot-flow__step hl-bot-flow__step--${state}`}
          >
            <span className="hl-bot-flow__num">{i + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
    {stepState('fund', phase, botRunning) === 'active' && (
      <a
        className="term-btn-sm w-full justify-center hl-bot-flow__link"
        href={HL_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Auf Hyperliquid einzahlen
      </a>
    )}
    {botRunning && (
      <p className="term-hint term-hint--ok hl-bot-flow__live">
        Bot läuft 24/7 auf Monadier-Servern · HL-Guthaben {hlBalanceUsd.toFixed(2)} USD ·
        Zyklus ca. alle 10s: Scan → Trade → TP/SL → wiederholen
      </p>
    )}
  </div>
);

export default HlBotFlowGuide;
