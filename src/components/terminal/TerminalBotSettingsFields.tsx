import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { getMaxLeverageLabel } from '../../lib/leverageLimits';
import LeverageRangeSlider from './LeverageRangeSlider';

const RISK_PRESETS = [1, 5, 25, 50, 100] as const;

export type BotSettingsFieldsProps = {
  planTier: string;
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
  riskLevel,
  setRiskLevel,
  leverage,
  setLeverage,
  takeProfit,
  setTakeProfit,
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
}) => {
  const maxLevLabel = getMaxLeverageLabel(planTier);
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
            <p className={isModal ? 'term-modal-toggle-title' : labelClass}>Auto-trading</p>
            <p className={hintClass}>Bot trades from your Hyperliquid balance on signals</p>
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

      <p className={labelClass}>Risk per trade</p>
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
      />

      <p className={labelClass}>Leverage (LVRG)</p>
      <p className={`${hintClass} ${isModal ? 'mb-2' : ''}`}>Up to {maxLevLabel} on Hyperliquid perps.</p>
      <div className={isModal ? undefined : 'term-panel-card term-panel-card--flat'}>
        <LeverageRangeSlider
          value={leverage}
          onChange={setLeverage}
          planTier={planTier}
          disabled={disabled}
          id={isModal ? 'bot-settings-leverage' : 'lvrg-panel-leverage'}
        />
      </div>

      {leverage >= 10 && (
        <p className={`${hintClass} term-hint--warn`}>
          {leverage >= 20
            ? `High leverage: ~${((100 / leverage) * 0.9).toFixed(1)}% move can liquidate.`
            : `+1% price ≈ +${leverage}% on position P/L.`}
        </p>
      )}

      {showAutoTrade && autoTrade && (
        <div
          className={
            isModal ? 'term-modal-toggle-row term-modal-toggle-row--compact' : 'term-panel-card term-panel-card--flat'
          }
        >
          <div>
            <p className={isModal ? 'term-modal-toggle-title' : labelClass}>Ask before each trade</p>
            <p className={hintClass}>5 min to approve via notification</p>
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
          <p className={`${labelClass} ${isModal ? 'term-modal-label--flush' : ''}`}>Win rate gate</p>
          {isModal && (
            <span
              className={`term-modal-gate-badge${minWinRate > 0 ? ' term-modal-gate-badge--on' : ''}`}
            >
              {minWinRate > 0 ? 'Active' : 'Off'}
            </span>
          )}
        </div>
        <p className={hintClass}>
          Optional: pause new trades if recent win rate drops below your threshold. Set 0% to disable.
        </p>

        <p className={labelClass}>Min win rate to open (0 = off)</p>
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
          Closed trades before gate applies
        </label>
        <div className="term-modal-gate-stepper">
          <button
            type="button"
            className="term-modal-chip"
            disabled={disabled || minTradesForWinRate <= 1}
            onClick={() => setMinTradesForWinRate(Math.max(1, minTradesForWinRate - 1))}
            aria-label="Fewer trades"
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
            aria-label="More trades"
          >
            +
          </button>
        </div>
      </div>

      <div className={isModal ? 'term-modal-grid-2' : 'term-panel-inputs'}>
        <label className={isModal ? undefined : 'term-panel-input-wrap'}>
          {isModal && (
            <span className={labelClass} id="term-tp-label">
              Take profit %
            </span>
          )}
          {!isModal && <span>TP %</span>}
          <input
            id="term-tp"
            type="number"
            className={inputClass}
            value={takeProfit}
            min={0.1}
            step={0.1}
            onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
            disabled={disabled}
            aria-labelledby={isModal ? 'term-tp-label' : undefined}
          />
        </label>
        <label className={isModal ? undefined : 'term-panel-input-wrap'}>
          {isModal && (
            <span className={labelClass} id="term-sl-label">
              Profit lock %
            </span>
          )}
          {!isModal && <span>SL %</span>}
          <input
            id="term-sl"
            type="number"
            className={inputClass}
            value={stopLoss}
            min={0.1}
            step={0.1}
            onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
            disabled={disabled}
            aria-labelledby={isModal ? 'term-sl-label' : undefined}
          />
        </label>
      </div>
      <p className={hintClass}>
        Take profit closes at collateral PnL %. Profit lock activates at lock% + 0.1%.
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
