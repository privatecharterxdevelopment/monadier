import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CookieConsent from '../components/ui/CookieConsent';
import GmxStyleLanding from '../components/landing/GmxStyleLanding';
import { useAuth } from '../contexts/AuthContext';
import { goToOpenApp } from '../lib/appUrls';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isAuthenticated && params.get('preview') !== 'landing') {
      const inApp = goToOpenApp('');
      if (inApp) navigate(inApp, { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <>
      <GmxStyleLanding />
      <CookieConsent />
    </>
  );
};

export default LandingPage;
