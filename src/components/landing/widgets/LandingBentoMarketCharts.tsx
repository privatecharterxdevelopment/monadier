import React from 'react';
import LandingBentoChartCard from './LandingBentoChartCard';
import { useBentoMarketCharts } from '../../../hooks/useBentoMarketCharts';

const LandingBentoMarketCharts: React.FC = () => {
  const { quotes, loading } = useBentoMarketCharts();

  return (
    <div className="landing-bento-market-charts">
      {quotes.map((quote) => (
        <LandingBentoChartCard key={quote.id} quote={quote} loading={loading} />
      ))}
    </div>
  );
};

export default LandingBentoMarketCharts;
