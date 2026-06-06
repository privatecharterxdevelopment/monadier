import React from 'react';
import LandingNav from '../landing/LandingNav';
import LandingFooter from '../landing/LandingFooter';
import CookieConsent from '../ui/CookieConsent';

type Props = {
  children: React.ReactNode;
  /** Narrower content column (auth-style pages) */
  narrow?: boolean;
  /** Center page title block */
  centered?: boolean;
  /** Full-width inner pages (How it works, Pricing, etc.) */
  inner?: boolean;
};

/** Public marketing pages — same nav bar and top spacing as GMX landing */
const MarketingPageLayout: React.FC<Props> = ({ children, narrow, centered, inner }) => {
  return (
    <div className="landing-gmx min-h-[100dvh] min-h-[100svh]">
      <LandingNav variant="light" layout="gmx" />
      <main
        className={[
          'landing-gmx-page-main',
          inner ? 'landing-gmx-page-main--inner' : '',
          narrow ? 'landing-gmx-page-main--narrow' : '',
          centered ? 'landing-gmx-page-main--centered' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </main>
      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default MarketingPageLayout;
