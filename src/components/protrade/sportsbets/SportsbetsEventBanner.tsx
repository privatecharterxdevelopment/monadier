import React from 'react';
import type { EventBannerVisual } from '../../../lib/sports/eventBanner';

type Props = {
  banner: EventBannerVisual;
  badge: string;
  emoji: string;
  title: string;
  summary: string;
};

const SportsbetsEventBanner: React.FC<Props> = ({ banner, badge, emoji, title, summary }) => {
  const [leftFlag, rightFlag] = banner.sideFlags;

  return (
    <header
      className={`hl-sb-event-banner hl-sb-event-banner--${banner.variant}`}
      style={
        {
          '--hl-sb-banner-accent': banner.accentColor,
          '--hl-sb-banner-image': `url(${banner.backgroundImage})`,
        } as React.CSSProperties
      }
    >
      <div
        className="hl-sb-event-banner-bg"
        style={{ backgroundImage: `url(${banner.backgroundImage})` }}
        aria-hidden
      />
      <div className="hl-sb-event-banner-overlay" aria-hidden />

      {leftFlag ? (
        <div className="hl-sb-event-banner-side hl-sb-event-banner-side--left" aria-hidden>
          <img src={leftFlag.url} alt="" width={96} height={72} loading="lazy" />
        </div>
      ) : null}

      {rightFlag ? (
        <div className="hl-sb-event-banner-side hl-sb-event-banner-side--right" aria-hidden>
          <img src={rightFlag.url} alt="" width={96} height={72} loading="lazy" />
        </div>
      ) : null}

      <div className="hl-sb-event-banner-content">
        <div className="hl-sb-event-banner-top">
          <span className="hl-sb-event-banner-badge">{badge}</span>
          <span className="hl-sb-event-banner-live">Live · mid prices</span>
        </div>

        <div className="hl-sb-event-banner-main">
          <span className="hl-sb-event-banner-emoji" aria-hidden>
            {emoji}
          </span>
          <h2 className="hl-sb-event-banner-title">{title}</h2>
          {banner.tagline ? (
            <p className="hl-sb-event-banner-tagline">{banner.tagline}</p>
          ) : null}
        </div>

        {summary ? <p className="hl-sb-event-banner-desc">{summary}</p> : null}
      </div>
    </header>
  );
};

export default SportsbetsEventBanner;
