import React from 'react';
import type { EventBannerSide, EventBannerVariant } from '../../lib/sports/eventBanner';

export type LandingEventBannerMediaProps = {
  backgroundImage: string;
  accentColor?: string;
  tagline?: string | null;
  variant?: EventBannerVariant;
  sideFlags: EventBannerSide[];
  emoji?: string;
  className?: string;
  compact?: boolean;
};

const LandingEventBannerMedia: React.FC<LandingEventBannerMediaProps> = ({
  backgroundImage,
  accentColor = '#e53935',
  tagline,
  variant = 'default',
  sideFlags,
  emoji,
  className = '',
  compact = false,
}) => (
  <div
    className={`landing-event-banner-media landing-event-banner-media--${variant}${compact ? ' landing-event-banner-media--compact' : ''} ${className}`.trim()}
    style={{ '--landing-banner-accent': accentColor } as React.CSSProperties}
  >
    <div
      className="landing-event-banner-media-bg"
      style={{ backgroundImage: `url(${backgroundImage})` }}
      aria-hidden
    />
    <div className="landing-event-banner-media-overlay" aria-hidden />

    {tagline ? <p className="landing-event-banner-tagline">{tagline}</p> : null}

    {sideFlags.length >= 2 ? (
      <div className="landing-event-banner-matchup" aria-hidden>
        <div className="landing-event-banner-team">
          <img src={sideFlags[0].url} alt="" width={compact ? 56 : 72} height={compact ? 42 : 54} loading="lazy" decoding="async" />
          <span>{sideFlags[0].label}</span>
        </div>
        <span className="landing-event-banner-vs">vs</span>
        <div className="landing-event-banner-team">
          <img src={sideFlags[1].url} alt="" width={compact ? 56 : 72} height={compact ? 42 : 54} loading="lazy" decoding="async" />
          <span>{sideFlags[1].label}</span>
        </div>
      </div>
    ) : sideFlags.length === 1 ? (
      <div className="landing-event-banner-solo" aria-hidden>
        <img
          src={sideFlags[0].url}
          alt=""
          width={compact ? 64 : 80}
          height={compact ? 48 : 60}
          loading="lazy"
          decoding="async"
        />
        <span>{sideFlags[0].label}</span>
      </div>
    ) : emoji ? (
      <span className="landing-event-banner-emoji" aria-hidden>
        {emoji}
      </span>
    ) : null}
  </div>
);

export default LandingEventBannerMedia;
