import React from 'react';
import LandingNav from '../landing/LandingNav';
import LandingFooter from '../landing/LandingFooter';
import CookieConsent from '../ui/CookieConsent';
import MarketingSeo from '../seo/MarketingSeo';
import MarketingPageBottomCta from '../marketing/MarketingPageBottomCta';

type Props = {
  children: React.ReactNode;
  /** Narrower content column (auth-style pages) */
  narrow?: boolean;
  /** Center page title block */
  centered?: boolean;
  /** Full-width inner pages (How it works, Pricing, etc.) */
  inner?: boolean;
  /** Legal prose — slightly narrower than nav/header (1200px) */
  legal?: boolean;
};

/** Public marketing pages — same nav bar and top spacing as GMX landing */
const MarketingPageLayout: React.FC<Props> = ({ children, narrow, centered, inner, legal }) => {
  return (
    <div className="landing-gmx min-h-[100dvh] min-h-[100svh]">
      <MarketingSeo />
      <LandingNav variant="light" layout="gmx" />
      <main
        className={[
          'landing-gmx-page-main',
          'landing-gmx-gutter',
          inner ? 'landing-gmx-page-main--inner' : '',
          legal ? 'landing-gmx-page-main--legal' : '',
          narrow ? 'landing-gmx-page-main--narrow' : '',
          centered ? 'landing-gmx-page-main--centered' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className={
            narrow
              ? 'landing-gmx-shell landing-gmx-shell--narrow'
              : legal
                ? 'landing-gmx-shell landing-gmx-shell--legal'
                : 'landing-gmx-shell'
          }
        >
          {children}
        </div>
      </main>
      {!legal && !narrow ? <MarketingPageBottomCta /> : null}
      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default MarketingPageLayout;
