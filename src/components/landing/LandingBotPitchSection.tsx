import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { goToOpenApp } from '../../lib/appUrls';

type PitchPart = {
  text: string;
  muted?: boolean;
};

function PitchLine({ parts }: { parts: readonly PitchPart[] }) {
  return (
    <p className="landing-gmx-bot-pitch-line">
      {parts.map((part, i) => (
        <span
          key={`${part.text}-${i}`}
          className={part.muted ? 'landing-gmx-bot-pitch-muted' : 'landing-gmx-bot-pitch-emphasis'}
        >
          {part.text}
        </span>
      ))}
    </p>
  );
}

/** Full-viewport scroll section — one centered title per screen, native scroll-snap. */
const LandingBotPitchSection: React.FC = () => {
  const { t } = useTranslation();
  const pitchLinesRaw = t('landing.pitch.lines', { returnObjects: true });
  const pitchLines = useMemo(() => {
    if (!Array.isArray(pitchLinesRaw)) return [] as PitchPart[][];
    return pitchLinesRaw as PitchPart[][];
  }, [pitchLinesRaw]);
  const lastStep = Math.max(0, pitchLines.length - 1);

  return (
    <section
      id="landing-pitch-section"
      className="landing-gmx-bot-pitch-section"
      aria-label="Trading bot highlights"
    >
      {pitchLines.map((line, index) => (
        <article
          key={index}
          className="landing-gmx-bot-pitch-slide"
          aria-hidden={false}
        >
          <div className="landing-gmx-bot-pitch-slide-inner">
            <PitchLine parts={line} />
            {index === lastStep ? (
              <button
                type="button"
                className="landing-gmx-bot-pitch-cta"
                onClick={() => goToOpenApp('?section=bot', false)}
              >
                {t('landing.pitch.ctaFinal', { defaultValue: t('landing.pitch.cta') })}
                <ArrowRight size={16} aria-hidden />
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
};

export default LandingBotPitchSection;
