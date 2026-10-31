import React from 'react';
import CookieConsent from '../ui/CookieConsent';
import MarketingSeo from '../seo/MarketingSeo';
import MarketingPageBottomCta from '../marketing/MarketingPageBottomCta';
import LandingPageShell from '../landing/LandingPageShell';
import { useLandingTheme } from '../../contexts/LandingThemeContext';

type Props = {
  children: React.ReactNode;
  /** Narrower content column (auth-style pages) — still uses shared AL column */
  narrow?: boolean;
  /** Center page title block */
  centered?: boolean;
  /** Full-width inner pages (How it works, Pricing, etc.) */
  inner?: boolean;
  /** Legal prose pages */
  legal?: boolean;
};

/** Public marketing pages — same AlphaLedger frame + content width as the home landing. */
const MarketingPageLayout: React.FC<Props> = ({ children, narrow, centered, inner, legal }) => {
  const { theme } = useLandingTheme();

  return (
    <div className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${theme}`}>
      <MarketingSeo />
      <LandingPageShell
        afterContent={!legal && !narrow ? <MarketingPageBottomCta /> : null}
      >
        <main
          className={[
            'landing-gmx-page-main',
            'landing-gmx-page-main--framed',
            'landing-gmx-gutter',
            inner ? 'landing-gmx-page-main--inner' : '',
            legal ? 'landing-gmx-page-main--legal' : '',
            narrow ? 'landing-gmx-page-main--narrow' : '',
            centered ? 'landing-gmx-page-main--centered' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="landing-gmx-shell">{children}</div>
        </main>
      </LandingPageShell>
      <CookieConsent />
    </div>
  );
};

export default MarketingPageLayout;
