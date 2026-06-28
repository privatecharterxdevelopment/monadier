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
  trail:
    'Dynamic ATR trail: arms in profit, stop ratchets with price. Winners can run; exits only when trail is hit.',
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
          description={`Arms at +${HL_DYNAMIC_TRAIL.breakevenArmRoePct}% ROE in profit, locks +${HL_DYNAMIC_TRAIL.armMinRoePct}% with ${HL_DYNAMIC_TRAIL.trailGapRoePct}% air from peak.`}
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
