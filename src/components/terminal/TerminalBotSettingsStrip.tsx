import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { VaultSettingsSnapshot } from '../../hooks/useTerminalVaultData';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
import { HL_BOT_STRATEGY_LABELS } from '../../lib/hlBotStrategy';

type Props = {
  settings: VaultSettingsSnapshot;
  onAdjust: () => void;
  disabled?: boolean;
};

const TerminalBotSettingsStrip: React.FC<Props> = ({ settings, onAdjust, disabled }) => {
  const eff = effectiveHlBotSettings(settings);

  return (
    <div
      className={`term-bot-settings ${disabled ? 'term-bot-settings--disabled' : ''}`}
      role="group"
      aria-label="Bot risk and leverage settings"
    >
      <div className="term-bot-settings-values">
        <span>
          <span className="term-bot-settings-k">Mode</span>{' '}
          <span className="term-bot-settings-v">{HL_BOT_STRATEGY_LABELS[settings.hlBotStrategy]}</span>
        </span>
        <span className="term-bot-settings-dot" aria-hidden>
          ·
        </span>
        <span>
          <span className="term-bot-settings-k">Risk</span>{' '}
          <span className="term-bot-settings-v">{eff.riskPct}%</span>
        </span>
        <span className="term-bot-settings-dot" aria-hidden>
          ·
        </span>
        <span>
          <span className="term-bot-settings-k">LVRG</span>{' '}
          <span className="term-bot-settings-v">{eff.leverage}x</span>
        </span>
        <span className="term-bot-settings-dot" aria-hidden>
          ·
        </span>
        <span>
          <span className="term-bot-settings-k">TP</span>{' '}
          <span className="term-bot-settings-v">
            {settings.hlBotStrategy === 'profit_grabber' ? 'trail' : `+${eff.takeProfit}%`}
          </span>
        </span>
        <span className="term-bot-settings-dot" aria-hidden>
          ·
        </span>
        <span>
          <span className="term-bot-settings-k">SL</span>{' '}
          <span className="term-bot-settings-v">−{eff.stopLoss}%</span>
        </span>
        <span className="term-bot-settings-dot" aria-hidden>
          ·
        </span>
        <span title="Profit lock: +$0.02 arms trail, floor min +$0.01, follows peak">
          <span className="term-bot-settings-k">Lock</span>{' '}
          <span className="term-bot-settings-v">
            +${eff.profitLockActivateUsd.toFixed(2)}→${eff.profitLockFloorUsd.toFixed(2)}↑
          </span>
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
