import React from 'react';
import {
  getMaxLeverageForPlan,
  getMaxLeverageLabel,
  snapLeverageToStep,
} from '../../lib/leverageLimits';

type Props = {
  value: number;
  onChange: (value: number) => void;
  planTier?: string | null;
  disabled?: boolean;
  id?: string;
};

const LeverageRangeSlider: React.FC<Props> = ({
  value,
  onChange,
  planTier,
  disabled,
  id = 'leverage-range',
}) => {
  const max = getMaxLeverageForPlan(planTier);
  const snapped = snapLeverageToStep(value, planTier);

  return (
    <div className="term-leverage-slider">
      <div className="term-leverage-slider-head">
        <label className="term-panel-card-label" htmlFor={id}>
          Leverage
        </label>
        <strong className="term-leverage-slider-value">{snapped}x</strong>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={max}
        step={1}
        value={snapped}
        className="term-modal-range"
        disabled={disabled}
        onChange={(e) => onChange(snapLeverageToStep(Number(e.target.value), planTier))}
      />
      <div className="term-leverage-slider-scale" aria-hidden>
        <span>1x</span>
        <span>{getMaxLeverageLabel(planTier)} max</span>
      </div>
      <p className="term-hint term-leverage-slider-hint">
        HL limits per pair (e.g. ETH 25x, BTC 40x) · saved to bot settings
      </p>
    </div>
  );
};

export default LeverageRangeSlider;
