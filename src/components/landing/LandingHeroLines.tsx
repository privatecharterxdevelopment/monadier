import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ROTATE_MS = 3200;

type Props = {
  lineDarkTop: string;
  rotateLines: readonly string[];
  lineDarkBottom: string;
  lineMutedPrefix?: string;
  className?: string;
};

const LandingHeroLines: React.FC<Props> = ({
  lineDarkTop,
  rotateLines,
  lineDarkBottom,
  lineMutedPrefix,
  className = '',
}) => {
  const [index, setIndex] = useState(0);
  const longest = rotateLines.reduce((a, b) => (a.length >= b.length ? a : b));
  const midLine = rotateLines[index] ?? rotateLines[0];

  useEffect(() => {
    if (rotateLines.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % rotateLines.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rotateLines.length]);

  return (
    <div className={`landing-gmx-hero-title ${className}`.trim()} data-hero-version="static-3-rows">
      <div className="landing-gmx-hero-lines">
        <div className="landing-gmx-hero-line landing-gmx-hero-line--dark">{lineDarkTop}</div>
        <div className="landing-gmx-hero-line landing-gmx-hero-line--rotate" aria-live="polite">
          <span className="landing-gmx-hero-line--rotate-sizer" aria-hidden>
            {lineMutedPrefix ? `${lineMutedPrefix} ${longest}` : longest}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={midLine}
              className="landing-gmx-hero-line landing-gmx-hero-line--muted landing-gmx-hero-line--rotate-visible"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {lineMutedPrefix ? (
                <>
                  {lineMutedPrefix}{' '}
                  <span className="landing-gmx-hero-line--rotate-word">{midLine}</span>
                </>
              ) : (
                midLine
              )}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="landing-gmx-hero-line landing-gmx-hero-line--dark">{lineDarkBottom}</div>
      </div>
    </div>
  );
};

export default LandingHeroLines;
