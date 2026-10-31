import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { redirectLegacyToProTrade } from '../../lib/appUrls';

/** Legacy /dashboard, /dashboard2, /app → Pro Trade at `/` */
const RedirectToApp: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    redirectLegacyToProTrade(location.pathname, location.search, true);
  }, [location.pathname, location.search]);

  return (
    <div className="flex items-center justify-center min-h-screen auth-page">
      <p className="text-[#71717a] text-sm">Opening Pro Trade…</p>
    </div>
  );
};

export default RedirectToApp;
