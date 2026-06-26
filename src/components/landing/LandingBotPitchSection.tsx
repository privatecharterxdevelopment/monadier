import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { goToOpenApp } from '../../lib/appUrls';
import { useLandingScrollSequence } from './useLandingScrollSequence';

type PitchPart = {
  text: string;
  muted?: boolean;
};

function PitchLine({ parts }: { parts: readonly PitchPart[] }) {
  return (
    <p className="landing-gmx-bot-pitch-line landing-gmx-bot-pitch-line--active">
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

/** One full-viewport section — one scroll advances one title. */
const LandingBotPitchSection: React.FC = () => {
  const { t } = useTranslation();
  const pitchLinesRaw = t('landing.pitch.lines', { returnObjects: true });
  const pitchLines = useMemo(() => {
    if (!Array.isArray(pitchLinesRaw)) return [] as PitchPart[][];
    return pitchLinesRaw as PitchPart[][];
  }, [pitchLinesRaw]);
  const lastStep = Math.max(0, pitchLines.length - 1);

  const { sectionRef, stepIndex, locked, unlocked } = useLandingScrollSequence({
    lockId: 'pitch',
    mode: 'step',
    stepCount: Math.max(1, pitchLines.length),
  });

  const activeLine = pitchLines[stepIndex] ?? pitchLines[0] ?? [];

  return (
    <section
      ref={sectionRef}
      className={`landing-gmx-bot-pitch-section${
        locked ? ' landing-gmx-scroll-sequence--locked' : ''
      }${unlocked ? ' landing-gmx-bot-pitch-section--unlocked' : ''}`}
      aria-label="Trading bot highlights"
    >
      <div className="landing-gmx-bot-pitch-sticky">
        <div className="landing-gmx-gutter landing-gmx-pitch-viewport">
          <div className="landing-gmx-pitch-stage">
            <div className="landing-gmx-bot-pitch-lines" aria-live="polite">
              <PitchLine key={stepIndex} parts={activeLine} />
            </div>

            {stepIndex === lastStep ? (
              <div className="landing-gmx-bot-pitch-cta-wrap landing-gmx-bot-pitch-cta-wrap--visible">
                <button
                  type="button"
                  className="landing-gmx-bot-pitch-cta"
                  onClick={() => goToOpenApp('?section=bot', false)}
                >
                  {t('landing.pitch.ctaFinal', { defaultValue: t('landing.pitch.cta') })}
                  <ArrowRight size={16} aria-hidden />
                </button>
              </div>
            ) : (
              <div className="landing-gmx-bot-pitch-cta-wrap" aria-hidden />
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingBotPitchSection;
