import React, { useMemo } from 'react';
import LandingBentoChartCard from './LandingBentoChartCard';
import { useBentoSportsBetCarousel } from '../../../hooks/useBentoEventCharts';
import type { BentoSportsBetCard } from '../../../lib/landing/bentoEventCardData';

const PLACEHOLDER: BentoSportsBetCard = {
  id: 'skel',
  pairLabel: '…',
  selection: '…',
  winAmount: '—',
  stakeValue: '$50.00',
  odds: '—',
};

const LandingBentoMarketCharts: React.FC = () => {
  const { cards, loading } = useBentoSportsBetCarousel();
  const loopCards = useMemo(() => {
    const base = cards.length > 0 ? cards : [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER];
    return [...base, ...base];
  }, [cards]);

  return (
    <div className="landing-bento-bets-carousel" aria-live="polite">
      <div
        className="landing-bento-bets-carousel-track"
        style={{ '--bento-carousel-items': loopCards.length } as React.CSSProperties}
      >
        {loopCards.map((quote, i) => (
          <LandingBentoChartCard key={`${quote.id}-${i}`} quote={quote} loading={loading && cards.length === 0} />
        ))}
      </div>
    </div>
  );
};

export default LandingBentoMarketCharts;
