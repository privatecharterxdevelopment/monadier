import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { VaultSettingsSnapshot } from '../../hooks/useTerminalVaultData';

type Props = {
  settings: VaultSettingsSnapshot;
  onAdjust: () => void;
  disabled?: boolean;
};

const TerminalBotSettingsStrip: React.FC<Props> = ({ settings, onAdjust, disabled }) => {
  return (
    <div
      className={`term-bot-settings ${disabled ? 'term-bot-settings--disabled' : ''}`}
      role="group"
      aria-label="Bot risk and leverage settings"
    >
      <div className="term-bot-settings-values">
        <span>
          <span className="term-bot-settings-k">Risk</span>{' '}
          <span className="term-bot-settings-v">{settings.riskPct}%</span>
        </span>
        <span className="term-bot-settings-dot" aria-hidden>
          ·
        </span>
        <span>
          <span className="term-bot-settings-k">LVRG</span>{' '}
          <span className="term-bot-settings-v">{settings.leverage}x</span>
        </span>
        <span className="term-bot-settings-dot" aria-hidden>
          ·
        </span>
        <span>
          <span className="term-bot-settings-k">TP</span>{' '}
          <span className="term-bot-settings-v">+{settings.takeProfit}%</span>
        </span>
        <span className="term-bot-settings-dot" aria-hidden>
          ·
        </span>
        <span>
          <span className="term-bot-settings-k">SL</span>{' '}
          <span className="term-bot-settings-v">−{settings.stopLoss}%</span>
        </span>
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
