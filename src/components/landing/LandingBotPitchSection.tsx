import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { goToOpenApp } from '../../lib/appUrls';
import { useLandingAutoSequence } from './useLandingAutoSequence';

const PITCH_LINE_IN_MS = 720;
const PITCH_STEP_MS = 2400;
const PITCH_VIDEO_WEBM = '/videos/pitch-money-bg.webm';
const PITCH_VIDEO_MP4 = '/videos/pitch-money-bg.mp4';

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

/** Auto-play full-viewport section — titles advance on a timer when in view. */
const LandingBotPitchSection: React.FC = () => {
  const { t } = useTranslation();
  const pitchLinesRaw = t('landing.pitch.lines', { returnObjects: true });
  const pitchLines = useMemo(() => {
    if (!Array.isArray(pitchLinesRaw)) return [] as PitchPart[][];
    return pitchLinesRaw as PitchPart[][];
  }, [pitchLinesRaw]);
  const lastStep = Math.max(0, pitchLines.length - 1);
  const pitchVideoRef = useRef<HTMLVideoElement>(null);
  const [mp4BlendFallback, setMp4BlendFallback] = useState(false);
  const [ctaRevealed, setCtaRevealed] = useState(false);

  const { sectionRef, stepIndex, complete } = useLandingAutoSequence({
    mode: 'step',
    stepCount: Math.max(1, pitchLines.length),
    stepDurationMs: PITCH_STEP_MS,
    visibilityThreshold: 0.3,
  });

  const onLastStep = stepIndex === lastStep;

  useEffect(() => {
    const probe = document.createElement('video');
    const canWebmVp9 = probe.canPlayType('video/webm; codecs="vp9"');
    setMp4BlendFallback(canWebmVp9 !== 'probably' && canWebmVp9 !== 'maybe');
  }, []);

  useEffect(() => {
    if (!onLastStep) {
      setCtaRevealed(false);
      return undefined;
    }

    const revealTimer = window.setTimeout(() => setCtaRevealed(true), PITCH_LINE_IN_MS);
    return () => window.clearTimeout(revealTimer);
  }, [onLastStep, stepIndex]);

  useEffect(() => {
    const video = pitchVideoRef.current;
    if (!video) return;

    void video.play().catch(() => {});
  }, [stepIndex, mp4BlendFallback]);

  const showCtaVisible = onLastStep && (ctaRevealed || complete);

  const activeLine = pitchLines[stepIndex] ?? pitchLines[0] ?? [];

  return (
    <section
      id="landing-pitch-section"
      ref={sectionRef}
      className={`landing-gmx-bot-pitch-section landing-gmx-section--auto-play landing-gmx-bot-pitch-section--with-video${
        onLastStep ? ' landing-gmx-bot-pitch-section--final' : ''
      }`}
      aria-label="Trading bot highlights"
    >
      <div className="landing-gmx-bot-pitch-sticky">
        <div className="landing-gmx-bot-pitch-video-wrap landing-gmx-bot-pitch-video-wrap--visible" aria-hidden>
          <video
            ref={pitchVideoRef}
            className={`landing-gmx-bot-pitch-video${
              mp4BlendFallback ? ' landing-gmx-bot-pitch-video--blend-fallback' : ''
            }`}
            muted
            loop
            playsInline
            preload="auto"
          >
            <source src={PITCH_VIDEO_WEBM} type="video/webm" />
            <source src={PITCH_VIDEO_MP4} type="video/mp4" />
          </video>
        </div>
        <div className="landing-gmx-pitch-stage">
          <div className="landing-gmx-bot-pitch-lines" aria-live="polite">
            <PitchLine key={stepIndex} parts={activeLine} />
          </div>

          {onLastStep ? (
            <div
              className={`landing-gmx-bot-pitch-cta-wrap${
                showCtaVisible ? ' landing-gmx-bot-pitch-cta-wrap--visible' : ''
              }`}
            >
              <div className="landing-gmx-bot-pitch-cta-group" role="group" aria-label={t('common.getStarted')}>
                <button
                  type="button"
                  className="landing-gmx-bot-pitch-cta landing-gmx-bot-pitch-cta--light"
                  onClick={() => goToOpenApp('', false)}
                >
                  {t('landing.pitch.ctaRegister')}
                  <ArrowRight size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="landing-gmx-bot-pitch-cta landing-gmx-bot-pitch-cta--dark"
                  onClick={() => goToOpenApp('?section=bot', false)}
                >
                  {t('landing.pitch.ctaLaunchBot')}
                  <ArrowRight size={16} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div className="landing-gmx-bot-pitch-cta-wrap" aria-hidden />
          )}
        </div>
      </div>
    </section>
  );
};

export default LandingBotPitchSection;
