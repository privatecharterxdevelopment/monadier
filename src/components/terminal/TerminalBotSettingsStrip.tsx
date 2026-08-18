import React from 'react';
import { useTranslation } from 'react-i18next';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import { effectiveHlBotSettings, effectiveStopLossPct } from '../../lib/hlBotEffectiveSettings';
import { HL_DYNAMIC_TRAIL } from '../../lib/hlBotStrategy';

type Props = {
  settings: VaultSettingsSnapshot;
  onAdjust: () => void;
  disabled?: boolean;
};

const TerminalBotSettingsStrip: React.FC<Props> = ({ settings, onAdjust, disabled }) => {
  const { t } = useTranslation();
  const eff = effectiveHlBotSettings(settings);
  const slPct = effectiveStopLossPct(settings.stopLoss);
  const sl =
    slPct > 0 ? t('tradePanel.maxSl', { pct: slPct }) : t('tradePanel.profitTrail');
  const trail = `2m→+${HL_DYNAMIC_TRAIL.armMinRoePct}%`;

  const metrics = [
    { key: 'risk' as const, label: t('tradePanel.risk'), value: `${eff.riskPct}%` },
    { key: 'lvrg' as const, label: t('tradePanel.lvrg'), value: `${eff.leverage}x` },
    { key: 'sl' as const, label: t('tradePanel.sl'), value: sl },
    { key: 'trail' as const, label: t('tradePanel.trail'), value: trail },
  ];

  return (
    <section
      className={`term-bot-settings term-bot-settings--grid ${disabled ? 'term-bot-settings--disabled' : ''}`}
      aria-label={t('tradePanel.parametersAria')}
    >
      <div className="term-bot-settings-head">
        <h3 className="term-bot-settings-head-title">{t('tradePanel.parameters')}</h3>
        <button
          type="button"
          className="term-bot-settings-head-adjust"
          onClick={onAdjust}
          disabled={disabled}
        >
          {t('tradePanel.adjust')}
          <span className="term-bot-settings-head-chevron" aria-hidden>
            ›
          </span>
        </button>
      </div>
      <div className="term-bot-settings-grid">
        {metrics.map((m) => (
          <div key={m.key} className="term-bot-settings-cell">
            <span className="term-bot-settings-cell-k">{m.label}</span>
            <span className="term-bot-settings-cell-v">{m.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TerminalBotSettingsStrip;
