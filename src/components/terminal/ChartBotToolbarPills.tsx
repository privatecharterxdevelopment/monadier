import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { effectiveHlBotSettings, formatHlSlLabel } from '../../lib/hlBotEffectiveSettings';
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
  trail: `Stage 1: +${HL_DYNAMIC_TRAIL.breakevenArmRoePct}% ROE locks +${HL_DYNAMIC_TRAIL.armMinRoePct}%. Stage 2: peak ≥+${HL_DYNAMIC_TRAIL.fullTrailArmRoePct}% → trail +${HL_DYNAMIC_TRAIL.trailGapRoePct}% from peak.`,
  sl: 'Max loss on margin while red — set in Settings. Off = profit trail only on winners.',
} as const;

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Bot risk / leverage / trail — grey pills for chart toolbar (right). */
const ChartBotToolbarPills: React.FC<Props> = ({ hlBalanceUsd = 0, variant = 'light' }) => {
  const { t } = useTranslation();
  const { settings } = useTerminalBotSettings();
  const eff = effectiveHlBotSettings(settings);
  const marginUsd = hlBalanceUsd > 0 ? (hlBalanceUsd * eff.riskPct) / 100 : null;

  const rootClass = variant === 'dark' ? 'hl-chart-bot-pills' : 'term-chart-bot-pills';

  return (
    <div className={rootClass} role="group" aria-label={t('tradePanel.parametersAria')}>
      <BotMetricPill
        variant={variant}
        label={t('tradePanel.risk')}
        value={`${eff.riskPct}%`}
        meta={marginUsd != null && marginUsd > 0 ? `~${fmtUsd(marginUsd)}` : undefined}
        description={DESCRIPTIONS.risk}
      />
      <BotMetricPill
        variant={variant}
        label={t('tradePanel.lvrg')}
        value={`${eff.leverage}x`}
        description={DESCRIPTIONS.lvrg}
      />
      <BotMetricPill
        variant={variant}
        label={t('tradePanel.sl')}
        value={formatHlSlLabel(settings.stopLoss)}
        description={DESCRIPTIONS.sl}
      />
      <BotMetricPill
        variant={variant}
        label={t('tradePanel.trail')}
        value={`+${HL_DYNAMIC_TRAIL.breakevenArmRoePct}%→+${HL_DYNAMIC_TRAIL.armMinRoePct}%`}
        description={DESCRIPTIONS.trail}
      />
    </div>
  );
};

export default ChartBotToolbarPills;
