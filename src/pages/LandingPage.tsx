import React from 'react';
import CookieConsent from '../components/ui/CookieConsent';
import GmxStyleLanding from '../components/landing/GmxStyleLanding';
import MarketingSeo from '../components/seo/MarketingSeo';

const LandingPage: React.FC = () => {
  return (
    <>
      <MarketingSeo path="/" />
      <GmxStyleLanding />
      <CookieConsent />
    </>
  );
};

export default LandingPage;
