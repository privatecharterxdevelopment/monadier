import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { getMaxLeverageLabel } from '../../lib/leverageLimits';
import LeverageRangeSlider from './LeverageRangeSlider';

const RISK_PRESETS = [1, 5, 25, 50, 100] as const;

export type BotSettingsFieldsProps = {
  planTier: string;
  hlSliderMax?: number;
  hlBtcMax?: number;
  hlEthMax?: number;
  riskLevel: number;
  setRiskLevel: (v: number) => void;
  leverage: number;
  setLeverage: (v: number) => void;
  takeProfit: number;
  setTakeProfit: (v: number) => void;
  stopLoss: number;
  setStopLoss: (v: number) => void;
  autoTrade: boolean;
  setAutoTrade: (v: boolean) => void;
  askPermission: boolean;
  setAskPermission: (v: boolean) => void;
  minWinRate: number;
  setMinWinRate: (v: number) => void;
  minTradesForWinRate: number;
  setMinTradesForWinRate: (v: number) => void;
  disabled?: boolean;
  variant?: 'panel' | 'modal';
  showAutoTrade?: boolean;
  walletConnected?: boolean;
  notice?: string | null;
  error?: string | null;
};

const TerminalBotSettingsFields: React.FC<BotSettingsFieldsProps> = ({
  planTier,
  hlSliderMax,
  hlBtcMax,
  hlEthMax,
  riskLevel,
  setRiskLevel,
  leverage,
  setLeverage,
  takeProfit: _takeProfit,
  setTakeProfit: _setTakeProfit,
  stopLoss: _stopLoss,
  setStopLoss: _setStopLoss,
  autoTrade,
  setAutoTrade,
  askPermission,
  setAskPermission,
  minWinRate,
  setMinWinRate,
  minTradesForWinRate,
  setMinTradesForWinRate,
  disabled,
  variant = 'panel',
  showAutoTrade = true,
  walletConnected = true,
  notice,
  error,
}) => {
  const { t } = useTranslation();
  const maxLevLabel = getMaxLeverageLabel(planTier, hlSliderMax);
  const isModal = variant === 'modal';
  const labelClass = isModal ? 'term-modal-label' : 'term-panel-card-label';
  const hintClass = isModal ? 'term-modal-hint' : 'term-hint';
  const chipRowClass = isModal
    ? 'term-modal-chip-row'
    : 'term-modal-chip-row term-modal-chip-row--wrap';
  const rangeClass = isModal ? 'term-modal-range' : 'term-modal-range';
  const inputClass = isModal ? 'term-modal-input' : 'term-panel-input';

  return (
    <>
      {showAutoTrade && (
        <div className={isModal ? 'term-modal-toggle-row' : 'term-panel-card term-panel-card--flat'}>
          <div>
            <p className={isModal ? 'term-modal-toggle-title' : labelClass}>{t('bot.autoTrading')}</p>
            <p className={hintClass}>
              {isModal ? t('bot.autoTradingHintModal') : t('bot.autoTradingHintPanel')}
            </p>
          </div>
          <button
            type="button"
            className={`term-modal-switch ${autoTrade ? 'term-modal-switch--on' : ''}`}
            onClick={() => setAutoTrade(!autoTrade)}
            disabled={disabled}
            aria-pressed={autoTrade}
          >
            <span className="term-modal-switch-knob" />
          </button>
        </div>
      )}

      <p className={labelClass}>{t('bot.riskPerTrade')}</p>
      <p className={`${hintClass} ${isModal ? 'mb-1' : ''}`}>
        <Trans i18nKey="bot.riskHint" components={{ strong: <strong /> }} />
      </p>
      <div className={chipRowClass}>
        {RISK_PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            className={`term-modal-chip ${riskLevel === v ? 'term-modal-chip--on' : ''}`}
            onClick={() => setRiskLevel(v)}
            disabled={disabled}
          >
            {v}%
          </button>
        ))}
      </div>
      <input
        type="range"
        min={1}
        max={100}
        value={riskLevel}
        onChange={(e) => setRiskLevel(parseInt(e.target.value, 10))}
        className={rangeClass}
        disabled={disabled}
        aria-label={t('bot.riskAria')}
      />

      <p className={labelClass}>{t('bot.leverage')}</p>
      <p className={`${hintClass} ${isModal ? 'mb-2' : ''}`}>
        {t('bot.leverageHint', {
          max: maxLevLabel,
          caps:
            hlBtcMax != null && hlEthMax != null
              ? t('bot.leverageCaps', { btc: hlBtcMax, eth: hlEthMax })
              : '',
        })}
      </p>
      <div className={isModal ? undefined : 'term-panel-card term-panel-card--flat'}>
        <LeverageRangeSlider
          value={leverage}
          onChange={setLeverage}
          planTier={planTier}
          hlSliderMax={hlSliderMax}
          disabled={disabled}
          id={isModal ? 'bot-settings-leverage' : 'lvrg-panel-leverage'}
        />
      </div>

      {leverage >= 10 && (
        <p className={`${hintClass} term-hint--warn`}>
          {leverage >= 20
            ? t('bot.leverageHigh', { pct: ((100 / leverage) * 0.9).toFixed(1) })
            : t('bot.leveragePnl', { lev: leverage })}
        </p>
      )}

      {showAutoTrade && autoTrade && (
        <div
          className={
            isModal ? 'term-modal-toggle-row term-modal-toggle-row--compact' : 'term-panel-card term-panel-card--flat'
          }
        >
          <div>
            <p className={isModal ? 'term-modal-toggle-title' : labelClass}>{t('bot.askBeforeTrade')}</p>
            <p className={hintClass}>{t('bot.askBeforeTradeHint')}</p>
          </div>
          <button
            type="button"
            className={`term-modal-switch ${askPermission ? 'term-modal-switch--on' : ''}`}
            onClick={() => setAskPermission(!askPermission)}
            disabled={disabled}
            aria-pressed={askPermission}
          >
            <span className="term-modal-switch-knob" />
          </button>
        </div>
      )}

      <div className={isModal ? 'term-modal-gate-box' : 'term-panel-card term-panel-card--flat'}>
        <div className={isModal ? 'term-modal-gate-head' : undefined}>
          <p className={`${labelClass} ${isModal ? 'term-modal-label--flush' : ''}`}>{t('bot.winRateGate')}</p>
          {isModal && (
            <span
              className={`term-modal-gate-badge${minWinRate > 0 ? ' term-modal-gate-badge--on' : ''}`}
            >
              {minWinRate > 0 ? t('bot.winRateActive') : t('bot.winRateOff')}
            </span>
          )}
        </div>
        <p className={hintClass}>{t('bot.winRateHint')}</p>

        <p className={labelClass}>{t('bot.minWinRate')}</p>
        <input
          type="range"
          min={0}
          max={80}
          step={5}
          value={minWinRate}
          onChange={(e) => setMinWinRate(parseInt(e.target.value, 10))}
          className={rangeClass}
          disabled={disabled}
        />

        <label className={labelClass} htmlFor="term-min-trades">
          {t('bot.closedTradesGate')}
        </label>
        <div className="term-modal-gate-stepper">
          <button
            type="button"
            className="term-modal-chip"
            disabled={disabled || minTradesForWinRate <= 1}
            onClick={() => setMinTradesForWinRate(Math.max(1, minTradesForWinRate - 1))}
            aria-label={t('bot.fewerTrades')}
          >
            −
          </button>
          <input
            id="term-min-trades"
            type="number"
            className={`${inputClass} ${isModal ? 'term-modal-input--center' : ''}`}
            min={1}
            max={50}
            value={minTradesForWinRate}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10);
              if (!Number.isNaN(raw)) {
                setMinTradesForWinRate(Math.min(50, Math.max(1, raw)));
              }
            }}
            disabled={disabled}
          />
          <button
            type="button"
            className="term-modal-chip"
            disabled={disabled || minTradesForWinRate >= 50}
            onClick={() => setMinTradesForWinRate(Math.min(50, minTradesForWinRate + 1))}
            aria-label={t('bot.moreTrades')}
          >
            +
          </button>
        </div>
      </div>

      <p className={hintClass}>
        <Trans i18nKey="bot.exitsHint" components={{ strong: <strong /> }} />
      </p>

      {notice && (
        <div className={isModal ? 'term-modal-alert term-modal-alert--ok' : 'term-panel-alert'}>
          {isModal ? <CheckCircle size={16} /> : <AlertCircle size={14} />}
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className={isModal ? 'term-modal-alert term-modal-alert--err' : 'term-panel-alert'}>
          <AlertCircle size={isModal ? 16 : 14} />
          <span>{error}</span>
        </div>
      )}
    </>
  );
};

export default TerminalBotSettingsFields;
