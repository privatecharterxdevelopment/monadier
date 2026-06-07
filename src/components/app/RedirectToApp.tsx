import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { goToOpenApp } from '../../lib/appUrls';

/** Legacy /dashboard2, /dashboard → Pro Trade at /app */
const RedirectToApp: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const inApp = goToOpenApp(location.search, true);
    if (inApp) navigate(inApp, { replace: true });
  }, [location.search, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen auth-page">
      <p className="text-[#71717a] text-sm">Opening app…</p>
    </div>
  );
};

export default RedirectToApp;
