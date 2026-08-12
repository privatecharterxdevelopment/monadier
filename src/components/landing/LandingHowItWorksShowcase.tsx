import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { HOW_IT_WORKS_IMAGES } from '../../lib/seo/howItWorksImages';

type Props = {
  /** `landing` = home section chrome; `page` = nested in /how-it-works */
  variant?: 'landing' | 'page';
};

function stepBadges(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((b): b is string => typeof b === 'string' && b.trim().length > 0);
}

/** Strip i18n Trans tags like <0>...</0> for plain attributes (alt/title). */
function plainI18n(s: string): string {
  return s.replace(/<\/?\d+>/g, '');
}

const LandingHowItWorksShowcase: React.FC<Props> = ({ variant = 'landing' }) => {
  const { t } = useTranslation();
  const title = t('landing.howShowcase.title');

  const rows = (
    <ol className="hiw-showcase-list">
      {HOW_IT_WORKS_IMAGES.map((img, i) => {
        const titleKey = `landing.howShowcase.steps.${img.id}.title`;
        const stepTitlePlain = plainI18n(t(titleKey));
        const stepText = t(`landing.howShowcase.steps.${img.id}.text`);
        const alt = t(`landing.howShowcase.steps.${img.id}.alt`);
        const badges = stepBadges(
          t(`landing.howShowcase.steps.${img.id}.badges`, { returnObjects: true })
        );
        return (
          <li
            key={img.id}
            id={`hiw-${img.id}`}
            className={`hiw-showcase-row hiw-showcase-row--${img.layout}${
              i % 2 === 1 ? ' hiw-showcase-row--flip' : ''
            }`}
          >
            <figure className={`hiw-showcase-figure hiw-showcase-figure--${img.layout}`}>
              <picture>
                <source type="image/webp" srcSet={img.webpSrcSet} sizes={img.sizes} />
                <img
                  src={img.src}
                  alt={alt}
                  title={stepTitlePlain}
                  width={img.width}
                  height={img.height}
                  className="hiw-showcase-shot"
                  sizes={img.sizes}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={i === 0 ? 'high' : 'low'}
                />
              </picture>
            </figure>
            <div className="hiw-showcase-copy">
              <span className="hiw-showcase-num" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="hiw-showcase-h3">
                <Trans
                  i18nKey={titleKey}
                  components={[<em className="hiw-showcase-em" key="em" />]}
                />
              </h3>
              <p className="hiw-showcase-text">{stepText}</p>
              {badges.length > 0 ? (
                <ul className="hiw-showcase-badges">
                  {badges.map((badge) => (
                    <li key={badge} className="hiw-showcase-badge">
                      {badge}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );

  if (variant === 'page') {
    return (
      <section className="hiw-showcase hiw-showcase--page" aria-labelledby="hiw-showcase-title">
        <h2 id="hiw-showcase-title" className="hiw-showcase-title hiw-showcase-title--hidden">
          {title}
        </h2>
        {rows}
        <hr className="hiw-showcase-rule" />
      </section>
    );
  }

  return (
    <section
      className="landing-gmx-section landing-gmx-gutter landing-how-showcase-section"
      aria-labelledby="hiw-showcase-title"
    >
      <div className="landing-gmx-shell landing-gmx-shell--home hiw-showcase">
        <h2 id="hiw-showcase-title" className="hiw-showcase-title hiw-showcase-title--hidden">
          {title}
        </h2>
        {rows}
        <hr className="hiw-showcase-rule" />
      </div>
    </section>
  );
};

export default LandingHowItWorksShowcase;
