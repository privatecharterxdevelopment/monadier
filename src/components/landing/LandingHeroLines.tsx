import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ROTATE_MS = 3200;

type Props = {
  lineDarkTop: string;
  rotateLines: readonly string[];
  lineDarkBottom?: string;
  /** middle = Trade | rotate | bottom (subpages). two-row = static block + rotate. */
  rotatePosition?: 'middle' | 'two-row';
  lineMutedPrefix?: string;
  /** Dark suffix on row 2 after rotate (two-row only). */
  rotateSuffix?: string;
  /** Drop rotate sizer width so suffix sits flush after animated text (betting hero). */
  tightRotateSuffix?: boolean;
  /** Bottom line uses muted/white styling instead of dark grey. */
  lineDarkBottomMuted?: boolean;
  className?: string;
};

const LandingHeroLines: React.FC<Props> = ({
  lineDarkTop,
  rotateLines,
  lineDarkBottom = '',
  rotatePosition = 'middle',
  lineMutedPrefix,
  rotateSuffix,
  tightRotateSuffix = false,
  lineDarkBottomMuted = false,
  className = '',
}) => {
  const [index, setIndex] = useState(0);
  const hasAdvancedRef = useRef(false);
  const longest = rotateLines.reduce((a, b) => (a.length >= b.length ? a : b));
  const midLine = rotateLines[index] ?? rotateLines[0];

  useEffect(() => {
    setIndex(0);
    hasAdvancedRef.current = false;
  }, [rotateLines]);

  useEffect(() => {
    if (rotateLines.length <= 1) return undefined;
    const id = window.setInterval(() => {
      hasAdvancedRef.current = true;
      setIndex((i) => (i + 1) % rotateLines.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rotateLines.length]);

  const rotateBlock = (
    <div
      className={`landing-gmx-hero-line landing-gmx-hero-line--rotate${
        tightRotateSuffix ? ' landing-gmx-hero-line--rotate-tight' : ''
      }`.trim()}
      aria-live="polite"
    >
      {!tightRotateSuffix ? (
        <span className="landing-gmx-hero-line--rotate-sizer" aria-hidden>
          {lineMutedPrefix ? `${lineMutedPrefix} ${longest}` : longest}
        </span>
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={midLine}
          className="landing-gmx-hero-line landing-gmx-hero-line--muted landing-gmx-hero-line--rotate-visible"
          initial={{ opacity: hasAdvancedRef.current ? 0 : 1 }}
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
  );

  return (
    <div className={`landing-gmx-hero-title ${className}`.trim()}>
      <div className="landing-gmx-hero-lines">
        {rotatePosition === 'two-row' ? (
          <>
            <div className="landing-gmx-hero-static-lines">
              <div className="landing-gmx-hero-line landing-gmx-hero-line--dark">{lineDarkTop}</div>
              {lineDarkBottom && !rotateSuffix ? (
                <div className="landing-gmx-hero-line landing-gmx-hero-line--dark">{lineDarkBottom}</div>
              ) : null}
            </div>
            {rotateSuffix ? (
              <div
                className={`landing-gmx-hero-line landing-gmx-hero-line--rotate-row${
                  tightRotateSuffix ? ' landing-gmx-hero-line--rotate-row-tight' : ''
                }`.trim()}
              >
                {rotateBlock}
                <span className="landing-gmx-hero-line landing-gmx-hero-line--muted landing-gmx-hero-line--suffix">
                  {rotateSuffix}
                </span>
              </div>
            ) : (
              rotateBlock
            )}
          </>
        ) : (
          <>
            <div className="landing-gmx-hero-line landing-gmx-hero-line--dark">{lineDarkTop}</div>
            {rotateBlock}
            {lineDarkBottom ? (
              <div
                className={`landing-gmx-hero-line ${
                  lineDarkBottomMuted ? 'landing-gmx-hero-line--muted' : 'landing-gmx-hero-line--dark'
                }`.trim()}
              >
                {lineDarkBottom}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default LandingHeroLines;
