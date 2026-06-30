import React from 'react';
import { useTranslation } from 'react-i18next';
import type { BentoSportsBetCard } from '../../../lib/landing/bentoEventCardData';

type Props = {
  quote: BentoSportsBetCard;
  loading?: boolean;
};

const LandingBentoChartCard: React.FC<Props> = ({ quote, loading }) => {
  const { t } = useTranslation();

  return (
    <article className="landing-bento-chart-card landing-bento-carousel-card" aria-label={quote.pairLabel}>
      <div className="landing-bento-chart-top">
        <div className="landing-bento-chart-head">
          <p className="landing-bento-chart-pair">{quote.pairLabel}</p>
          {loading && !quote.winAmount ? (
            <div className="landing-bento-chart-price-skel" aria-hidden />
          ) : (
            <p className="landing-bento-chart-price">{quote.winAmount}</p>
          )}
        </div>
        <svg viewBox="0 0 24 24" className="landing-bento-chart-icon" aria-hidden>
          <path
            fill="currentColor"
            d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 0 1 6.32 12.9l-1.42-1.42A6 6 0 1 0 12 6V4Zm-1 4h2v5.17l3.59 2.08-1 1.73L11 13V6Z"
          />
        </svg>
      </div>

      <div className="landing-bento-chart-plot landing-bento-carousel-card-mid" aria-hidden>
        <span className="landing-bento-carousel-card-tag">
          {quote.selection || t('landing.widgets.markets.sportsBet')}
        </span>
      </div>

      <div className="landing-bento-chart-stats">
        <div className="landing-bento-chart-stat">
          <span className="landing-bento-chart-stat-label">{t('landing.widgets.markets.stake')}</span>
          <span className="landing-bento-chart-stat-value is-up">
            <span className="landing-bento-chart-caret" aria-hidden>
              ▲
            </span>
            {quote.stakeValue}
          </span>
        </div>
        <div className="landing-bento-chart-stat landing-bento-chart-stat--right">
          <span className="landing-bento-chart-stat-label">{t('landing.widgets.markets.decimalOdds')}</span>
          <span className="landing-bento-chart-stat-value is-up">
            <span className="landing-bento-chart-caret" aria-hidden>
              ▲
            </span>
            {quote.odds}
          </span>
        </div>
      </div>
    </article>
  );
};

export default LandingBentoChartCard;
