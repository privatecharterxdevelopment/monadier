import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { goToOpenApp } from '../../lib/appUrls';

/** Legacy /app, /dashboard2 → Pro Trade at `/` */
const RedirectToApp: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    goToOpenApp(location.search, true);
  }, [location.search]);

  return (
    <div className="flex items-center justify-center min-h-screen auth-page">
      <p className="text-[#71717a] text-sm">Opening app…</p>
    </div>
  );
};

export default RedirectToApp;
