import React from 'react';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';
import { useLandingScrollSequence } from './useLandingScrollSequence';

type PitchPart = {
  text: string;
  muted?: boolean;
};

const PITCH_LINES: readonly PitchPart[][] = [
  [
    { text: 'The worlds most advanced ', muted: true },
    { text: 'trading bot' },
  ],
  [
    { text: 'Searches over ', muted: true },
    { text: '200 pairs' },
    { text: ', executes and closes automatically', muted: true },
  ],
  [
    { text: '$20 USD minimum ', muted: true },
    { text: 'and up to 40x leverage' },
  ],
  [
    { text: 'Runs ', muted: true },
    { text: '24/7, 365 days' },
    { text: ', fully on ', muted: true },
    { text: 'Hyperliquid' },
  ],
  [
    { text: 'Get intelligent ', muted: true },
    { text: 'AI analysis and news' },
    { text: ' in real time', muted: true },
  ],
  [
    { text: 'Start ', muted: true },
    { text: 'making money now' },
  ],
] as const;

const LAST_STEP = PITCH_LINES.length - 1;

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
  const { sectionRef, stepIndex, locked, unlocked } = useLandingScrollSequence({
    lockId: 'pitch',
    mode: 'step',
    stepCount: PITCH_LINES.length,
  });

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
              <PitchLine key={stepIndex} parts={PITCH_LINES[stepIndex]} />
            </div>

            {stepIndex === LAST_STEP ? (
              <div className="landing-gmx-bot-pitch-cta-wrap landing-gmx-bot-pitch-cta-wrap--visible">
                <button
                  type="button"
                  className="landing-gmx-bot-pitch-cta"
                  onClick={() => goToOpenApp('?section=bot', false)}
                >
                  Start trading now
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
