import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CookieConsent from '../components/ui/CookieConsent';
import MinimalLanding from '../components/landing/MinimalLanding';
import { useAuth } from '../contexts/AuthContext';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  return (
    <>
      <MinimalLanding />
      <CookieConsent />
    </>
  );
};

export default LandingPage;
