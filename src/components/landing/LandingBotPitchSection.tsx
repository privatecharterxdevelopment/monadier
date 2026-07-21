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
  const [isMobilePitch, setIsMobilePitch] = useState(false);
  const [ctaRevealed, setCtaRevealed] = useState(false);

  const { sectionRef, stepIndex, complete } = useLandingAutoSequence({
    mode: 'step',
    stepCount: Math.max(1, pitchLines.length),
    stepDurationMs: PITCH_STEP_MS,
    visibilityThreshold: 0.3,
  });

  const onLastStep = stepIndex === lastStep;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobilePitch(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const probe = document.createElement('video');
    const canWebmVp9 = probe.canPlayType('video/webm; codecs="vp9"');
    // Mobile always needs screen-blend (opaque MP4). Desktop only when VP9 missing.
    setMp4BlendFallback(
      isMobilePitch || (canWebmVp9 !== 'probably' && canWebmVp9 !== 'maybe')
    );
  }, [isMobilePitch]);

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
    const section = sectionRef.current;
    if (!video || !section) return;

    // Force the correct source — some browsers ignore <source media="…">.
    const nextSrc = isMobilePitch ? PITCH_VIDEO_MP4 : PITCH_VIDEO_WEBM;
    const absolute = new URL(nextSrc, window.location.origin).href;

    const attachAndPlay = () => {
      if (video.currentSrc !== absolute) {
        video.src = nextSrc;
        video.load();
      }
      void video.play().catch(() => {});
    };

    // Don't compete with the hero: only fetch the heavy pitch clip near viewport.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          attachAndPlay();
          io.disconnect();
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 }
    );
    io.observe(section);
    return () => io.disconnect();
  }, [mp4BlendFallback, isMobilePitch, sectionRef]);

  const showCtaVisible = onLastStep && (ctaRevealed || complete);

  const activeLine = pitchLines[stepIndex] ?? pitchLines[0] ?? [];
  const useBlend = mp4BlendFallback || isMobilePitch;

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
        <div
          className={`landing-gmx-bot-pitch-video-wrap landing-gmx-bot-pitch-video-wrap--visible${
            useBlend ? ' landing-gmx-bot-pitch-video-wrap--blend' : ''
          }`}
          aria-hidden
        >
          <video
            ref={pitchVideoRef}
            className={`landing-gmx-bot-pitch-video${
              useBlend ? ' landing-gmx-bot-pitch-video--blend-fallback' : ''
            }`}
            muted
            loop
            playsInline
            preload="none"
          />
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
