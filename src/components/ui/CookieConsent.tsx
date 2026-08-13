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
    <div className="cookie-consent" role="dialog" aria-label="Cookie consent">
      <p className="cookie-consent__text">
        We use cookies to enhance your browsing experience and, if you accept, Google Analytics to
        understand traffic. See our{' '}
        <a href="/privacy" className="cookie-consent__link">
          Privacy Policy
        </a>
        .
      </p>
      <div className="cookie-consent__actions">
        <Button variant="secondary" size="sm" onClick={handleDecline}>
          Decline
        </Button>
        <Button variant="primary" size="sm" onClick={handleAccept}>
          Accept All
        </Button>
      </div>
    </div>
  );
};

export default CookieConsent;
