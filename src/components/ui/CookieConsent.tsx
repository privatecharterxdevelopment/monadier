import React, { useState, useEffect } from 'react';
import Button from './Button';
import { loadGoogleAnalytics } from '../../lib/analytics';

const CONSENT_KEY = 'cookieConsent';

const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      setIsVisible(true);
      return;
    }
    if (consent === 'accepted') loadGoogleAnalytics();
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setIsVisible(false);
    loadGoogleAnalytics();
  };

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card-dark border-t border-border p-4 z-50 backdrop-blur-sm">
      <div className="container-custom flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-secondary">
          We use cookies to enhance your browsing experience and, if you accept, Google Analytics to
          understand traffic. See our{' '}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex gap-4">
          <Button variant="secondary" size="sm" onClick={handleDecline}>
            Decline
          </Button>
          <Button variant="primary" size="sm" onClick={handleAccept}>
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
