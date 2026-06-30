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
  hlSliderMax?: number;
  disabled?: boolean;
  id?: string;
  /** Hide duplicate title when parent card already shows leverage. */
  embedded?: boolean;
};

const LeverageRangeSlider: React.FC<Props> = ({
  value,
  onChange,
  planTier,
  hlSliderMax,
  disabled,
  id = 'leverage-range',
  embedded = false,
}) => {
  const max = getMaxLeverageForPlan(planTier, hlSliderMax);
  const snapped = snapLeverageToStep(value, planTier, hlSliderMax);

  return (
    <div className={`term-leverage-slider${embedded ? ' term-leverage-slider--embedded' : ''}`}>
      {!embedded ? (
        <div className="term-leverage-slider-head">
          <label className="term-panel-card-label" htmlFor={id}>
            Leverage
          </label>
          <strong className="term-leverage-slider-value">{snapped}x</strong>
        </div>
      ) : null}
      <input
        id={id}
        type="range"
        min={1}
        max={max}
        step={1}
        value={snapped}
        className="term-modal-range"
        disabled={disabled}
        onChange={(e) =>
          onChange(snapLeverageToStep(Number(e.target.value), planTier, hlSliderMax))
        }
      />
      <div className="term-leverage-slider-scale" aria-hidden>
        <span>1x</span>
        <span>{getMaxLeverageLabel(planTier, hlSliderMax)} max</span>
      </div>
      <p className={`term-hint term-leverage-slider-hint${embedded ? ' term-leverage-slider-hint--compact' : ''}`}>
        {embedded
          ? `HL caps per asset (BTC ${hlSliderMax ?? max}x max on slider)`
          : `HL per-asset caps (e.g. BTC ${hlSliderMax ?? max}x, ETH often 25x) · applied when the bot opens`}
      </p>
    </div>
  );
};

export default LeverageRangeSlider;
