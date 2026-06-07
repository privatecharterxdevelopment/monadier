import React, { useEffect } from 'react';
import CookieConsent from '../components/ui/CookieConsent';
import GmxStyleLanding from '../components/landing/GmxStyleLanding';
import { useAuth } from '../contexts/AuthContext';
import { goToOpenApp } from '../lib/appUrls';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isAuthenticated && params.get('preview') !== 'landing') {
      goToOpenApp('', true);
    }
  }, [isAuthenticated]);

  return (
    <>
      <GmxStyleLanding />
      <CookieConsent />
    </>
  );
};

export default LandingPage;
