import React from 'react';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../../lib/appUrls';

export type AppleFeatureWidgetTone = 'light' | 'dark' | 'photo';

type Props = {
  title: string;
  desc: string;
  cta: string;
  section: string;
  tone?: AppleFeatureWidgetTone;
  image?: string;
  video?: string;
  imagePosition?: 'cover' | 'top';
  visual?: React.ReactNode;
  layout?: 'tile' | 'hero';
  compact?: boolean;
  hideCta?: boolean;
  className?: string;
};

const LandingAppleFeatureWidget: React.FC<Props> = ({
  title,
  desc,
  cta,
  section,
  tone = 'light',
  image,
  video,
  imagePosition = 'cover',
  visual,
  layout = 'tile',
  compact = false,
  hideCta = false,
  className = '',
}) => (
  <article
    className={[
      'landing-apple-widget',
      `landing-apple-widget--${tone}`,
      image || video ? 'landing-apple-widget--has-media' : '',
      image && imagePosition === 'top' ? 'landing-apple-widget--image-top' : '',
      video ? 'landing-apple-widget--has-video' : '',
      image && imagePosition === 'cover' ? 'landing-apple-widget--has-cover' : '',
      layout === 'hero' ? 'landing-apple-widget--hero' : '',
      compact ? 'landing-apple-widget--compact' : '',
      hideCta ? 'landing-apple-widget--no-cta' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {video ? (
      <div className="landing-apple-widget-media" aria-hidden>
        <video
          className="landing-apple-widget-video"
          src={video}
          autoPlay
          loop
          muted
          playsInline
          preload="none"
        />
        <div className="landing-apple-widget-media-shade" />
      </div>
    ) : image && imagePosition === 'cover' ? (
      <img src={image} alt="" className="landing-apple-widget-photo" loading="lazy" decoding="async" aria-hidden />
    ) : image ? (
      <img src={image} alt="" className="landing-apple-widget-photo landing-apple-widget-photo--top" loading="lazy" decoding="async" aria-hidden />
    ) : null}

    {visual ? <div className="landing-apple-widget-visual">{visual}</div> : null}

    <div className="landing-apple-widget-content">
      <h3 className="landing-apple-widget-title">{title}</h3>
      {!compact ? <p className="landing-apple-widget-desc">{desc}</p> : null}
    </div>

    {!hideCta ? (
      <div className="landing-apple-widget-foot">
        <button
          type="button"
          className="landing-apple-widget-cta"
          onClick={() => goToOpenApp(section, false)}
        >
          {cta}
          <ArrowRight size={14} aria-hidden />
        </button>
      </div>
    ) : null}
  </article>
);

export default LandingAppleFeatureWidget;
