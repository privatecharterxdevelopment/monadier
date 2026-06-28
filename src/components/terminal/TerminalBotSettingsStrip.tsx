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

const TerminalBotSettingsStrip: React.FC<Props> = ({ settings, onAdjust, disabled }) => {
  const eff = effectiveHlBotSettings(settings);
  const sl = formatHlSlLabel(settings.stopLoss).replace(/^Max /, '');
  const trail = `+${HL_DYNAMIC_TRAIL.breakevenArmRoePct}→+${HL_DYNAMIC_TRAIL.armMinRoePct}%`;

  return (
    <div
      className={`term-bot-settings term-bot-settings--compact ${disabled ? 'term-bot-settings--disabled' : ''}`}
      role="group"
      aria-label="Bot risk and leverage settings"
    >
      <div className="term-bot-settings-inline">
        <span className="term-bot-settings-chip">
          <span className="term-bot-settings-chip-k">Risk</span>
          <span className="term-bot-settings-chip-v">{eff.riskPct}%</span>
        </span>
        <span className="term-bot-settings-chip">
          <span className="term-bot-settings-chip-k">LVRG</span>
          <span className="term-bot-settings-chip-v">{eff.leverage}x</span>
        </span>
        <span className="term-bot-settings-chip">
          <span className="term-bot-settings-chip-k">SL</span>
          <span className="term-bot-settings-chip-v">{sl}</span>
        </span>
        <span className="term-bot-settings-chip">
          <span className="term-bot-settings-chip-k">Trail</span>
          <span className="term-bot-settings-chip-v">{trail}</span>
        </span>
      </div>
      <button
        type="button"
        className="term-icon-btn term-bot-settings-edit term-bot-settings-edit--compact"
        onClick={onAdjust}
        disabled={disabled}
        title="Adjust risk & leverage"
        aria-label="Adjust risk and leverage"
      >
        <SlidersHorizontal size={13} />
      </button>
    </div>
  );
};

export default TerminalBotSettingsStrip;
