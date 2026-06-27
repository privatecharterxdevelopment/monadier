import React, { useEffect } from 'react';
import CookieConsent from '../components/ui/CookieConsent';
import GmxStyleLanding from '../components/landing/GmxStyleLanding';
import MarketingSeo from '../components/seo/MarketingSeo';
import { useAuth } from '../contexts/AuthContext';
import { goToOpenApp } from '../lib/appUrls';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === 'landing') return;

    const hasAppDeepLink = params.has('section') || params.has('tab');
    if (hasAppDeepLink) {
      goToOpenApp(window.location.search, true);
      return;
    }

    if (isAuthenticated) {
      goToOpenApp('', true);
    }
  }, [isAuthenticated]);

  return (
    <>
      <MarketingSeo path="/" />
      <GmxStyleLanding />
      <CookieConsent />
    </>
  );
};

export default LandingPage;
