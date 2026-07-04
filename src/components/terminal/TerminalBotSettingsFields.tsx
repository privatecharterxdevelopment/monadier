import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { getMaxLeverageLabel } from '../../lib/leverageLimits';
import LeverageRangeSlider from './LeverageRangeSlider';

const RISK_PRESETS = [1, 5, 25, 50, 100] as const;
const STOP_LOSS_PRESETS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

function clampStopLossPct(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(50, Math.round(raw * 10) / 10);
}

function stopLossPresetActive(current: number, preset: number): boolean {
  return Math.abs(current - preset) < 0.05;
}

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
  variant?: 'panel' | 'modal' | 'lvrg';
  showAutoTrade?: boolean;
  walletConnected?: boolean;
  notice?: string | null;
  error?: string | null;
  hlBalanceUsd?: number;
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
  stopLoss,
  setStopLoss,
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
  hlBalanceUsd = 0,
}) => {
  const { t } = useTranslation();
  const maxLevLabel = getMaxLeverageLabel(planTier, hlSliderMax);
  const isModal = variant === 'modal';
  const isLvrg = variant === 'lvrg';
  const labelClass = isModal ? 'term-modal-label' : 'term-panel-card-label';
  const hintClass = isModal ? 'term-modal-hint' : 'term-hint';
  const chipRowClass = isModal
    ? 'term-modal-chip-row'
    : 'term-modal-chip-row term-modal-chip-row--wrap';
  const rangeClass = isModal ? 'term-modal-range' : 'term-modal-range';
  const inputClass = isModal ? 'term-modal-input' : 'term-panel-input';
  const collateralUsd = (hlBalanceUsd * riskLevel) / 100;
  const notionalUsd = collateralUsd * leverage;
  const winRateGateOn = minWinRate > 0;

  if (isLvrg) {
    return (
      <>
        <div className="term-lvrg-setting-card">
          <div className="term-lvrg-setting-head">
            <p className="term-lvrg-setting-title">{t('bot.leverageShort')}</p>
            <span className="term-lvrg-setting-value">{leverage}x</span>
          </div>
          <LeverageRangeSlider
            embedded
            value={leverage}
            onChange={setLeverage}
            planTier={planTier}
            hlSliderMax={hlSliderMax}
            disabled={disabled}
            id="lvrg-panel-leverage"
          />
          {leverage >= 10 && (
            <p className={`${hintClass} term-hint--warn term-lvrg-setting-foot`}>
              {leverage >= 20
                ? t('bot.leverageHigh', { pct: ((100 / leverage) * 0.9).toFixed(1) })
                : t('bot.leveragePnl', { lev: leverage })}
            </p>
          )}
        </div>

        <div className="term-lvrg-setting-card">
          <div className="term-lvrg-setting-head">
            <p className="term-lvrg-setting-title">{t('bot.riskPerTrade')}</p>
            <span className="term-lvrg-setting-value">{riskLevel}%</span>
          </div>
          <p className="term-lvrg-setting-desc">
            <Trans i18nKey="bot.riskHintShort" components={{ strong: <strong /> }} />
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
          {hlBalanceUsd > 0 ? (
            <p className="term-lvrg-setting-foot">
              ~${collateralUsd.toFixed(2)} margin · ~${notionalUsd.toFixed(0)} notional
            </p>
          ) : null}
        </div>

        <div className="term-lvrg-setting-card">
          <div className="term-lvrg-setting-head">
            <p className="term-lvrg-setting-title">{t('bot.stopLossTitle')}</p>
            <span className="term-lvrg-setting-value">
              {stopLoss > 0 ? `−${stopLoss}%` : t('bot.stopLossOff')}
            </span>
          </div>
          <p className="term-lvrg-setting-desc">{t('bot.stopLossHint')}</p>
          <div className={chipRowClass}>
            <button
              type="button"
              className={`term-modal-chip ${stopLoss <= 0 ? 'term-modal-chip--on' : ''}`}
              onClick={() => setStopLoss(0)}
              disabled={disabled}
            >
              {t('bot.stopLossOff')}
            </button>
            {STOP_LOSS_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                className={`term-modal-chip ${stopLossPresetActive(stopLoss, v) ? 'term-modal-chip--on' : ''}`}
                onClick={() => setStopLoss(v)}
                disabled={disabled}
              >
                {v}%
              </button>
            ))}
          </div>
          <div className="term-lvrg-gate-row term-lvrg-gate-row--trades">
            <label className="term-lvrg-gate-label" htmlFor="lvrg-stop-loss-custom">
              {t('bot.stopLossCustom')}
            </label>
            <input
              id="lvrg-stop-loss-custom"
              type="number"
              className={`${inputClass} term-modal-input--center`}
              min={0}
              max={50}
              step={0.1}
              placeholder="7.5"
              value={stopLoss > 0 ? stopLoss : ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  setStopLoss(0);
                  return;
                }
                const n = parseFloat(raw);
                if (!Number.isNaN(n)) setStopLoss(clampStopLossPct(n));
              }}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="term-lvrg-setting-card">
          <div className="term-lvrg-setting-head term-lvrg-setting-head--gate">
            <div>
              <p className="term-lvrg-setting-title">{t('bot.winRateGate')}</p>
              <p className="term-lvrg-setting-desc">{t('bot.winRateGateShort')}</p>
            </div>
            <button
              type="button"
              className={`term-modal-switch ${winRateGateOn ? 'term-modal-switch--on' : ''}`}
              onClick={() => setMinWinRate(winRateGateOn ? 0 : Math.max(minWinRate, 40) || 40)}
              disabled={disabled}
              aria-pressed={winRateGateOn}
              aria-label={winRateGateOn ? t('bot.winRateActive') : t('bot.winRateOff')}
            >
              <span className="term-modal-switch-knob" />
            </button>
          </div>

          {winRateGateOn ? (
            <div className="term-lvrg-gate-fields">
              <div className="term-lvrg-gate-row">
                <label className="term-lvrg-gate-label" htmlFor="lvrg-min-win-rate">
                  {t('bot.minWinRateShort')}
                </label>
                <span className="term-lvrg-gate-value">{minWinRate}%</span>
              </div>
              <input
                id="lvrg-min-win-rate"
                type="range"
                min={20}
                max={80}
                step={5}
                value={minWinRate}
                onChange={(e) => setMinWinRate(parseInt(e.target.value, 10))}
                className={rangeClass}
                disabled={disabled}
              />

              <div className="term-lvrg-gate-row term-lvrg-gate-row--trades">
                <label className="term-lvrg-gate-label" htmlFor="lvrg-min-trades">
                  {t('bot.closedTradesGateShort')}
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
                    id="lvrg-min-trades"
                    type="number"
                    className={`${inputClass} term-modal-input--center`}
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
            </div>
          ) : (
            <p className="term-lvrg-setting-foot">{t('bot.winRateOffHint')}</p>
          )}
        </div>

        {notice && (
          <div className="term-panel-alert">
            <AlertCircle size={14} />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className="term-panel-alert">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
      </>
    );
  }

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

      {isModal && (
        <p className={hintClass}>
          <Trans i18nKey="bot.exitsHint" components={{ strong: <strong /> }} />
        </p>
      )}

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
