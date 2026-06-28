import React from 'react';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
import { HL_DYNAMIC_TRAIL } from '../../lib/hlBotStrategy';
import BotMetricPill from './BotMetricPill';

type Props = {
  hlBalanceUsd?: number;
  /** dashboard2 light chart vs pro trade dark toolbar */
  variant?: 'light' | 'dark';
};

const DESCRIPTIONS = {
  risk: 'Share of your HL balance used as margin per trade — not the same as leverage.',
  lvrg: 'Hyperliquid multiplier on that margin. Bot clamps to each market’s max leverage.',
  trail:
    'Dynamic ATR trail: arms in profit, stop ratchets with price. Winners can run; exits only when trail is hit.',
} as const;

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Bot risk / leverage / trail — grey pills for chart toolbar (right). */
const ChartBotToolbarPills: React.FC<Props> = ({ hlBalanceUsd = 0, variant = 'light' }) => {
  const { settings } = useTerminalBotSettings();
  const eff = effectiveHlBotSettings(settings);
  const marginUsd = hlBalanceUsd > 0 ? (hlBalanceUsd * eff.riskPct) / 100 : null;

  const rootClass = variant === 'dark' ? 'hl-chart-bot-pills' : 'term-chart-bot-pills';

  return (
    <div className={rootClass} role="group" aria-label="Bot settings">
      <BotMetricPill
        variant={variant}
        label="Risk"
        value={`${eff.riskPct}%`}
        meta={marginUsd != null && marginUsd > 0 ? `~${fmtUsd(marginUsd)}` : undefined}
        description={DESCRIPTIONS.risk}
      />
      <BotMetricPill
        variant={variant}
        label="LVRG"
        value={`${eff.leverage}x`}
        description={DESCRIPTIONS.lvrg}
      />
      <BotMetricPill
        variant={variant}
        label="Trail"
        value={`+${HL_DYNAMIC_TRAIL.breakevenArmRoePct}%→+${HL_DYNAMIC_TRAIL.armMinRoePct}%`}
        description={`Arms at +${HL_DYNAMIC_TRAIL.breakevenArmRoePct}% ROE in profit, locks +${HL_DYNAMIC_TRAIL.armMinRoePct}% with ${HL_DYNAMIC_TRAIL.trailGapRoePct}% air from peak.`}
      />
    </div>
  );
};

export default ChartBotToolbarPills;
