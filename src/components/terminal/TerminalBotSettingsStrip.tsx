import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
import { HL_DYNAMIC_TRAIL } from '../../lib/hlBotStrategy';
import BotMetricPill from './BotMetricPill';

type Props = {
  settings: VaultSettingsSnapshot;
  onAdjust: () => void;
  disabled?: boolean;
};

const DESCRIPTIONS = {
  risk: 'Share of your HL balance used as margin per trade — not the same as leverage.',
  lvrg: 'Hyperliquid multiplier on that margin. Bot clamps to each market’s max leverage.',
  trail: `Stage 1: +${HL_DYNAMIC_TRAIL.breakevenArmRoePct}% ROE locks +${HL_DYNAMIC_TRAIL.armMinRoePct}%. Stage 2: peak ≥+${HL_DYNAMIC_TRAIL.fullTrailArmRoePct}% → trail.`,
} as const;

const TerminalBotSettingsStrip: React.FC<Props> = ({ settings, onAdjust, disabled }) => {
  const eff = effectiveHlBotSettings(settings);

  return (
    <div
      className={`term-bot-settings ${disabled ? 'term-bot-settings--disabled' : ''}`}
      role="group"
      aria-label="Bot risk and leverage settings"
    >
      <div className="term-bot-settings-pills">
        <BotMetricPill
          label="Risk"
          value={`${eff.riskPct}%`}
          description={DESCRIPTIONS.risk}
        />
        <BotMetricPill
          label="LVRG"
          value={`${eff.leverage}x`}
          description={DESCRIPTIONS.lvrg}
        />
        <BotMetricPill
          label="Trail"
          value={`+${HL_DYNAMIC_TRAIL.breakevenArmRoePct}%→+${HL_DYNAMIC_TRAIL.armMinRoePct}%`}
          description={DESCRIPTIONS.trail}
        />
      </div>
      <button
        type="button"
        className="term-icon-btn term-bot-settings-edit"
        onClick={onAdjust}
        disabled={disabled}
        title="Adjust bot settings"
        aria-label="Adjust bot settings"
      >
        <SlidersHorizontal size={14} />
      </button>
    </div>
  );
};

export default TerminalBotSettingsStrip;
