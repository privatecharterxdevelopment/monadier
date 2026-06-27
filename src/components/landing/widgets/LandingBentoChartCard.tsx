import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildSparklinePaths,
  formatMarketPrice,
  formatPctChange,
  type BentoMarketId,
  type BentoMarketQuote,
} from '../../../lib/landing/bentoMarketData';

type Props = {
  quote: BentoMarketQuote;
  loading?: boolean;
};

function MarketIcon({ id }: { id: BentoMarketId }) {
  if (id === 'btc') {
    return (
      <svg viewBox="0 0 24 24" className="landing-bento-chart-icon" aria-hidden>
        <path
          fill="currentColor"
          d="M16.5 10.2c.2-1.4-.9-2.2-2.4-2.7l.5-2-1.2-.3-.5 1.9c-.3-.1-.7-.2-1-.3l.5-1.9-1.2-.3-.5 2c-.3-.1-.5-.1-.8-.2l-1.7-.4-.3 1.3s.9.2.9.2c.5.1.6.4.6.7l-1.3 5.2c0 .2-.2.5-.5.4 0 0-.9-.2-.9-.2l-.6 1.4 1.6.4c.3.1.6.2.9.3l-.5 2 1.2.3.5-2c.3.1.7.2 1 .3l-.5 2 1.2.3.5-2c3.1.6 5.4.4 6.4-2.4.8-2.3 0-3.6-1.7-4.5 1.2-.3 2.1-1.1 2.3-2.8zm-4.1 5.8c-.6 2.3-4.4 1.1-5.6.8l1-3.9c1.2.3 5.1.9 4.6 3.1zm.6-5.9c-.5 2.1-3.7 1-4.7.7l.9-3.6c1 .3 4.3.8 3.8 2.9z"
        />
      </svg>
    );
  }
  if (id === 'eth') {
    return (
      <svg viewBox="0 0 24 24" className="landing-bento-chart-icon" aria-hidden>
        <path
          fill="currentColor"
          d="M12 2 5 12.2l7 4.1 7-4.1L12 2zm0 16.3-7-4.1L12 22l7-7.8-7 4.1z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="landing-bento-chart-icon" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.2 6.8 3.8L12 11.8 5.2 8 12 4.2zM5 9.3l7 3.9v7.6L5 16.9V9.3zm14 0v7.6l-7 4.9v-7.6l7-3.9z"
      />
    </svg>
  );
}

const LandingBentoChartCard: React.FC<Props> = ({ quote, loading }) => {
  const { t } = useTranslation();
  const positive = quote.change24hPct >= 0;
  const volumeUp = quote.volumeChangePct >= 0;

  const spark = useMemo(
    () => buildSparklinePaths(quote.sparkline, quote.openPrice24h || quote.price),
    [quote.sparkline, quote.openPrice24h, quote.price]
  );

  const stroke = positive ? '#22c55e' : '#ef4444';

  return (
    <article className="landing-bento-chart-card" aria-label={quote.name}>
      <div className="landing-bento-chart-top">
        <div className="landing-bento-chart-head">
          <p className="landing-bento-chart-pair">{quote.pairLabel}</p>
          {loading && quote.price <= 0 ? (
            <div className="landing-bento-chart-price-skel" aria-hidden />
          ) : (
            <p className="landing-bento-chart-price">{formatMarketPrice(quote.price)}</p>
          )}
        </div>
        <MarketIcon id={quote.id} />
      </div>

      <div className="landing-bento-chart-plot" aria-hidden>
        {spark ? (
          <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="landing-bento-chart-svg">
            <line
              x1="0"
              y1={spark.baselineY}
              x2="100"
              y2={spark.baselineY}
              className="landing-bento-chart-baseline"
            />
            <path d={spark.line} className="landing-bento-chart-line" style={{ stroke }} />
          </svg>
        ) : (
          <div className="landing-bento-chart-plot-skel" />
        )}
      </div>

      <div className="landing-bento-chart-stats">
        <div className="landing-bento-chart-stat">
          <span className="landing-bento-chart-stat-label">{t('landing.widgets.markets.volume24h')}</span>
          <span className={`landing-bento-chart-stat-value ${volumeUp ? 'is-up' : 'is-down'}`}>
            <span className="landing-bento-chart-caret" aria-hidden>
              {volumeUp ? '▲' : '▼'}
            </span>
            {formatPctChange(quote.volumeChangePct)}
          </span>
        </div>
        <div className="landing-bento-chart-stat landing-bento-chart-stat--right">
          <span className="landing-bento-chart-stat-label">{t('landing.widgets.markets.change24h')}</span>
          <span className={`landing-bento-chart-stat-value ${positive ? 'is-up' : 'is-down'}`}>
            <span className="landing-bento-chart-caret" aria-hidden>
              {positive ? '▲' : '▼'}
            </span>
            {formatPctChange(quote.change24hPct)}
          </span>
        </div>
      </div>
    </article>
  );
};

export default LandingBentoChartCard;
