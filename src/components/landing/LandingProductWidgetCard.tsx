import React from 'react';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';

export type LandingProductWidgetCardProps = {
  image: string;
  label: string;
  section: string;
  variant?: 'carousel' | 'grid';
  className?: string;
};

const LandingProductWidgetCard: React.FC<LandingProductWidgetCardProps> = ({
  image,
  label,
  section,
  variant = 'carousel',
  className = '',
}) => (
  <article
    className={[
      'landing-gmx-product-card',
      'landing-gmx-product-carousel-card',
      'landing-gmx-product-carousel-card--cta-only',
      variant === 'grid' ? 'landing-gmx-product-widget-card' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    aria-label={label}
  >
    <img
      src={image}
      alt=""
      className="landing-gmx-product-carousel-card-media"
      loading="lazy"
      decoding="async"
      aria-hidden
    />
    <div className="landing-gmx-product-card-copy">
      <button
        type="button"
        className="landing-gmx-product-card-cta"
        onClick={() => goToOpenApp(section, false)}
      >
        {label}
        <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  </article>
);

export default LandingProductWidgetCard;
