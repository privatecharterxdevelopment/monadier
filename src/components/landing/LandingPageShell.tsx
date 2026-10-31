import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import LandingNav from './LandingNav';
import LandingFooter from './LandingFooter';
import LandingAssistWidget from './LandingAssistWidget';

type Props = {
  children: React.ReactNode;
  /** Extra content inside the scroll frame, after children (e.g. bottom CTA). */
  afterContent?: React.ReactNode;
  /** Show outer disclaimer footer below the frame (default true). */
  showFooter?: boolean;
};

/**
 * Panther / AlphaLedger shell:
 * outer gutter → rounded frame (alpha header + scroll) → footer outside below.
 */
const LandingPageShell: React.FC<Props> = ({
  children,
  afterContent = null,
  showFooter = true,
}) => {
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="landing-al">
      <div className="landing-al-shell">
        <div className="landing-al-frame">
          <LandingNav layout="alpha" />
          <div className="landing-al-scroll" ref={scrollRef}>
            {children}
            {afterContent}
          </div>
        </div>
        {showFooter ? <LandingFooter variant="outer" /> : null}
      </div>
      <LandingAssistWidget />
    </div>
  );
};

export default LandingPageShell;
