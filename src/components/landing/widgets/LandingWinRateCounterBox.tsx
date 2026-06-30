import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const TARGET_WIN_RATE = 71.4;
const DURATION_MS = 2400;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const LandingWinRateCounterBox: React.FC = () => {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35, rootMargin: '-40px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return undefined;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setValue(easeOutCubic(t) * TARGET_WIN_RATE);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  const formatted = `${value.toFixed(1).replace('.', ',')}`.replace(',0', ',0');

  return (
    <div ref={boxRef} className="landing-agent-winrate-box" aria-live="polite">
      <p className="landing-agent-winrate-label">{t('landing.agentSections.winrate.boxLabel')}</p>
      <p className="landing-agent-winrate-value">
        <span className="landing-agent-winrate-number">
          {started ? value.toFixed(1) : '0.0'}
        </span>
        <span className="landing-agent-winrate-suffix">%</span>
      </p>
      <p className="landing-agent-winrate-caption">{t('landing.agentSections.winrate.boxCaption')}</p>
    </div>
  );
};

export default LandingWinRateCounterBox;
