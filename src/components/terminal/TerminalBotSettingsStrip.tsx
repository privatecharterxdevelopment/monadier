import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import { effectiveHlBotSettings, formatHlSlLabel } from '../../lib/hlBotEffectiveSettings';
import { HL_DYNAMIC_TRAIL } from '../../lib/hlBotStrategy';

type Props = {
  settings: VaultSettingsSnapshot;
  onAdjust: () => void;
  disabled?: boolean;
};

const ROWS = [
  { key: 'risk', label: 'Risk' },
  { key: 'lvrg', label: 'LVRG' },
  { key: 'sl', label: 'SL' },
  { key: 'trail', label: 'Trail' },
] as const;

const TerminalBotSettingsStrip: React.FC<Props> = ({ settings, onAdjust, disabled }) => {
  const eff = effectiveHlBotSettings(settings);
  const sl = formatHlSlLabel(settings.stopLoss).replace(/^Max /, '');
  const trail = `+${HL_DYNAMIC_TRAIL.breakevenArmRoePct}→+${HL_DYNAMIC_TRAIL.armMinRoePct}%`;

  const values: Record<(typeof ROWS)[number]['key'], string> = {
    risk: `${eff.riskPct}%`,
    lvrg: `${eff.leverage}x`,
    sl,
    trail,
  };

  return (
    <div
      className={`term-bot-settings term-bot-settings--stacked ${disabled ? 'term-bot-settings--disabled' : ''}`}
      role="group"
      aria-label="Bot risk and leverage settings"
    >
      <div className="term-bot-settings-rows">
        {ROWS.map((row) => (
          <div key={row.key} className="term-bot-settings-row">
            <span className="term-bot-settings-row-k">{row.label}</span>
            <span className="term-bot-settings-row-v">{values[row.key]}</span>
          </div>
        ))}
      </div>
      <div className="term-bot-settings-sep" role="separator" aria-hidden />
      <button
        type="button"
        className="term-bot-settings-adjust"
        onClick={onAdjust}
        disabled={disabled}
      >
        <SlidersHorizontal size={13} aria-hidden />
        Adjust
      </button>
    </div>
  );
};

export default TerminalBotSettingsStrip;
