import React from 'react';
import { ArrowRight, Percent, Target } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';
import { LANDING_BET_STAKE_USD, type LandingBetMarket } from '../../lib/api/landingSportsEvents';

type Props = {
  market: LandingBetMarket;
  surface?: 'photo' | 'light';
};

const LandingBetSportWidgetCard: React.FC<Props> = ({ market, surface = 'photo' }) => (
  <article
    className={`landing-sport-widget-card${
      surface === 'light' ? ' landing-sport-widget-card--light' : ''
    }`}
  >
    {surface === 'photo' ? (
      <>
        <div
          className="landing-sport-widget-bg"
          style={{ backgroundImage: `url(${market.backgroundImage})` }}
          aria-hidden
        />
        <div className="landing-sport-widget-bg-shade" aria-hidden />
      </>
    ) : null}

    <div className="landing-sport-widget-body">
      <div className="landing-sport-widget-panel">
        <div className="landing-sport-widget-head">
          <div className="landing-sport-widget-head-copy">
            {market.isLive ? (
              <span className="landing-sport-widget-live">
                {market.indicative ? 'Live · mid' : 'Live'}
              </span>
            ) : null}
            <h3 className="landing-sport-widget-title">{market.cardTitle}</h3>
          </div>
          {market.sideFlags.length >= 2 ? (
            <div className="landing-sport-widget-flags" aria-hidden>
              <img src={market.sideFlags[0].url} alt="" width={32} height={24} loading="lazy" />
              <span>vs</span>
              <img src={market.sideFlags[1].url} alt="" width={32} height={24} loading="lazy" />
            </div>
          ) : null}
        </div>

        <div className="landing-sport-widget-stats">
          <div className="landing-sport-widget-stat landing-sport-widget-stat--primary">
            <span className="landing-sport-widget-stat-label">Odds</span>
            <span className="landing-sport-widget-stat-value">{market.odds}</span>
          </div>
          <div className="landing-sport-widget-stat">
            <Percent size={13} strokeWidth={2} aria-hidden />
            <span className="landing-sport-widget-stat-label">Implied</span>
            <span className="landing-sport-widget-stat-value">{market.winRate}</span>
          </div>
          <div className="landing-sport-widget-stat">
            <Target size={13} strokeWidth={2} aria-hidden />
            <span className="landing-sport-widget-stat-label">Return</span>
            <span className="landing-sport-widget-stat-value">{market.payoutLabel}</span>
          </div>
        </div>

        <p className="landing-sport-widget-prediction">
          {market.cardHeadline} · {market.selection}
          <span className="landing-sport-widget-prediction-stake">
            {' '}
            · ${LANDING_BET_STAKE_USD} stake
          </span>
        </p>
      </div>

      <button
        type="button"
        className="landing-sport-widget-cta"
        onClick={() => goToOpenApp('?section=sportsbets', false)}
      >
        Open market
        <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  </article>
);

export default LandingBetSportWidgetCard;
