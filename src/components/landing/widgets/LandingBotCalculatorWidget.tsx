import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BOT_ROI_DEFAULTS,
  estimateBotRoi,
  formatMultiple,
  formatUsd,
  formatWinRate,
} from '../../../lib/landing/botRoiCalculator';

type Props = {
  defaultStake?: string;
  defaultLeverage?: number;
};

const LandingBotCalculatorWidget: React.FC<Props> = ({
  defaultStake = '50',
  defaultLeverage = BOT_ROI_DEFAULTS.refLeverage,
}) => {
  const { t } = useTranslation();
  const [stakeInput, setStakeInput] = useState(defaultStake);
  const [leverage, setLeverage] = useState(defaultLeverage);

  const stakeUsd = useMemo(() => {
    const parsed = Number.parseFloat(stakeInput.replace(/,/g, ''));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [stakeInput]);

  const estimate = useMemo(() => estimateBotRoi(stakeUsd, leverage), [stakeUsd, leverage]);

  return (
    <div className="landing-apple-widget landing-apple-widget--calc">
      <div className="landing-apple-widget-calc-row landing-apple-widget-calc-row--controls">
        <div className="landing-apple-widget-calc-stake">
          <label className="landing-apple-widget-calc-label" htmlFor="landing-bot-stake">
            {t('landing.widgets.calc.stakeLabel')}
          </label>
          <div className="landing-apple-widget-calc-input-wrap">
            <span className="landing-apple-widget-calc-currency" aria-hidden>
              $
            </span>
            <input
              id="landing-bot-stake"
              className="landing-apple-widget-calc-input"
              inputMode="decimal"
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              aria-label={t('landing.widgets.calc.stakeLabel')}
            />
            <span className="landing-apple-widget-calc-unit">USDC</span>
          </div>
        </div>

        <div className="landing-apple-widget-calc-lev">
          <div className="landing-apple-widget-calc-lev-head">
            <span className="landing-apple-widget-calc-label">{t('landing.widgets.calc.leverage')}</span>
            <strong className="landing-apple-widget-calc-lev-value">{leverage}x</strong>
          </div>
          <input
            type="range"
            className="landing-apple-widget-calc-range"
            min={1}
            max={BOT_ROI_DEFAULTS.maxLeverage}
            step={1}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            aria-label={t('landing.widgets.calc.leverage')}
          />
        </div>
      </div>

      <div className="landing-apple-widget-calc-row landing-apple-widget-calc-row--result">
        <div className="landing-apple-widget-calc-result-meta">
          <p className="landing-apple-widget-calc-roi-label">{t('landing.widgets.calc.monthlyProfit')}</p>
          <p className="landing-apple-widget-calc-mini" aria-hidden>
            <span className="is-gain">+{formatUsd(estimate.profitPerWinUsd)}</span>
            <span className="sep">·</span>
            <span className="is-loss">−{formatUsd(estimate.lossPerLossUsd)}</span>
            <span className="sep">·</span>
            <span>{formatMultiple(estimate.monthlyReturnMultiple)}</span>
            <span className="sep">·</span>
            <span>{formatWinRate(estimate.winRate)}</span>
          </p>
        </div>
        <p className="landing-apple-widget-calc-roi">{formatUsd(estimate.monthlyProfitUsd)}</p>
      </div>
    </div>
  );
};

export default LandingBotCalculatorWidget;
