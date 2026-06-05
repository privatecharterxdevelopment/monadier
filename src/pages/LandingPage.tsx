import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CookieConsent from '../components/ui/CookieConsent';
import GmxStyleLanding from '../components/landing/GmxStyleLanding';
import { useAuth } from '../contexts/AuthContext';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isAuthenticated && params.get('preview') !== 'landing') {
      navigate('/dashboard2');
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
