import React from 'react';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
import { HL_BOT_STRATEGY_LABELS } from '../../lib/hlBotStrategy';
import TradeReasonHint from './TradeReasonHint';

type Props = {
  hlBalanceUsd?: number;
  /** dashboard2 light chart vs pro trade dark toolbar */
  variant?: 'light' | 'dark';
};

const WHY = {
  mode: 'Standard = wider profit trail. Aggressive = faster in/out on smaller moves.',
  risk: 'Share of your HL balance used as margin per trade — not the same as leverage.',
  lvrg: 'Hyperliquid multiplier on that margin. Bot clamps to each market’s max leverage.',
  trail: 'Dynamic ATR trail: arms at +0.5% ROE (or 2× fees). Stop ratchets with price — winners can run hours. Never closes in red unless trail hit.',
} as const;

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Bot mode / risk / leverage / trail — grey pills for chart toolbar (right). */
const ChartBotToolbarPills: React.FC<Props> = ({ hlBalanceUsd = 0, variant = 'light' }) => {
  const { settings } = useTerminalBotSettings();
  const eff = effectiveHlBotSettings(settings);
  const marginUsd = hlBalanceUsd > 0 ? (hlBalanceUsd * eff.riskPct) / 100 : null;

  const rootClass =
    variant === 'dark' ? 'hl-chart-bot-pills' : 'term-chart-bot-pills';
  const pillClass =
    variant === 'dark'
      ? 'hl-chart-bot-pill'
      : 'term-chart-live-badge term-chart-bot-pill';

  return (
    <div className={rootClass} role="group" aria-label="Bot settings">
      <div className={pillClass} title={WHY.mode}>
        <span className={variant === 'dark' ? 'hl-chart-bot-pill__label' : 'term-chart-live-badge__label'}>
          Mode
        </span>
        <span className={variant === 'dark' ? 'hl-chart-bot-pill__value' : 'term-chart-live-badge__pair'}>
          {HL_BOT_STRATEGY_LABELS[settings.hlBotStrategy]}
        </span>
        <TradeReasonHint reason={WHY.mode} kind="plain" label="Why mode" className="term-trade-reason-hint--inline" />
      </div>
      <div className={pillClass} title={WHY.risk}>
        <span className={variant === 'dark' ? 'hl-chart-bot-pill__label' : 'term-chart-live-badge__label'}>
          Risk per trade
        </span>
        <span className={variant === 'dark' ? 'hl-chart-bot-pill__value' : 'term-chart-live-badge__pair'}>
          {eff.riskPct}%
        </span>
        {marginUsd != null && marginUsd > 0 ? (
          <span className={variant === 'dark' ? 'hl-chart-bot-pill__meta' : 'term-chart-live-badge__price'}>
            ~{fmtUsd(marginUsd)}
          </span>
        ) : null}
        <TradeReasonHint reason={WHY.risk} kind="plain" label="Why risk" className="term-trade-reason-hint--inline" />
      </div>
      <div className={pillClass} title={WHY.lvrg}>
        <span className={variant === 'dark' ? 'hl-chart-bot-pill__label' : 'term-chart-live-badge__label'}>
          LVRG
        </span>
        <span className={variant === 'dark' ? 'hl-chart-bot-pill__value' : 'term-chart-live-badge__pair'}>
          {eff.leverage}x
        </span>
        <TradeReasonHint reason={WHY.lvrg} kind="plain" label="Why leverage" className="term-trade-reason-hint--inline" />
      </div>
      <div className={pillClass} title={WHY.trail}>
        <span className={variant === 'dark' ? 'hl-chart-bot-pill__label' : 'term-chart-live-badge__label'}>
          Trail SL
        </span>
        <span className={variant === 'dark' ? 'hl-chart-bot-pill__value' : 'term-chart-live-badge__pair'}>
          +{eff.trailArmRoePct}% ROE arm
        </span>
        <TradeReasonHint reason={WHY.trail} kind="plain" label="Why trail SL" className="term-trade-reason-hint--inline" />
      </div>
    </div>
  );
};

export default ChartBotToolbarPills;
