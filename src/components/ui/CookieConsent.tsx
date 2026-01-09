import React, { useState, useEffect } from 'react';
import Button from './Button';

const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'accepted');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card-dark border-t border-gray-800 p-4 z-50 backdrop-blur-sm">
      <div className="container-custom flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-secondary">
          We use cookies to enhance your browsing experience. By continuing to use our site, you agree to our use of cookies.
        </p>
        <div className="flex gap-4">
          <Button variant="secondary" size="sm" onClick={() => setIsVisible(false)}>
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