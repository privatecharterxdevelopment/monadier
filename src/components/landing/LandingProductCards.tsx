import React from 'react';
import { useTranslation } from 'react-i18next';
import LandingProductWidgetCard from './LandingProductWidgetCard';

const PRODUCT_CARD_META = [
  {
    id: 'bot',
    image: '/images/landing/landing-carousel-bot-brain.png',
    section: '?section=bot',
  },
  {
    id: 'perps',
    image: '/images/landing/landing-carousel-perps-candles.png',
    section: '',
  },
  {
    id: 'betting',
    image: '/images/landing/landing-carousel-betting-trophy.png',
    section: '?section=sportsbets',
  },
  {
    id: 'predictions',
    image: '/images/landing/landing-carousel-predictions-question.png',
    section: '?section=sportsbets',
  },
] as const;

/** Four product cards — own section under the MacBook. */
const LandingProductCards: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section className="landing-al-cards-section" aria-label="HyperGain products">
      <div className="landing-al-cards-grid">
        {PRODUCT_CARD_META.map((card) => (
          <LandingProductWidgetCard
            key={card.id}
            image={card.image}
            label={t(`landing.carousel.cards.${card.id}.cta`)}
            section={card.section}
            variant="grid"
            className="landing-al-card"
          />
        ))}
      </div>
    </section>
  );
};

export default LandingProductCards;
