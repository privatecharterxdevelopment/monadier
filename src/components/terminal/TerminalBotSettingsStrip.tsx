import React from 'react';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import { effectiveHlBotSettings, formatHlSlLabel } from '../../lib/hlBotEffectiveSettings';
import { HL_DYNAMIC_TRAIL } from '../../lib/hlBotStrategy';

type Props = {
  settings: VaultSettingsSnapshot;
  onAdjust: () => void;
  disabled?: boolean;
};

const METRICS = [
  { key: 'risk', label: 'Risk' },
  { key: 'lvrg', label: 'LVRG' },
  { key: 'sl', label: 'SL' },
  { key: 'trail', label: 'Trail' },
] as const;

const TerminalBotSettingsStrip: React.FC<Props> = ({ settings, onAdjust, disabled }) => {
  const eff = effectiveHlBotSettings(settings);
  const sl = formatHlSlLabel(settings.stopLoss).replace(/^Max /, '');
  const trail = `+${HL_DYNAMIC_TRAIL.breakevenArmRoePct}→+${HL_DYNAMIC_TRAIL.armMinRoePct}%`;

  const values: Record<(typeof METRICS)[number]['key'], string> = {
    risk: `${eff.riskPct}%`,
    lvrg: `${eff.leverage}x`,
    sl,
    trail,
  };

  return (
    <section
      className={`term-bot-settings term-bot-settings--grid ${disabled ? 'term-bot-settings--disabled' : ''}`}
      aria-label="Bot parameters"
    >
      <div className="term-bot-settings-head">
        <h3 className="term-bot-settings-head-title">Parameters</h3>
        <button
          type="button"
          className="term-bot-settings-head-adjust"
          onClick={onAdjust}
          disabled={disabled}
        >
          Adjust
          <span className="term-bot-settings-head-chevron" aria-hidden>
            ›
          </span>
        </button>
      </div>
      <div className="term-bot-settings-grid">
        {METRICS.map((m) => (
          <div key={m.key} className="term-bot-settings-cell">
            <span className="term-bot-settings-cell-k">{m.label}</span>
            <span className="term-bot-settings-cell-v">{values[m.key]}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TerminalBotSettingsStrip;
