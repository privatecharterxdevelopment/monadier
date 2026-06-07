import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAppEntryPath, goToApp } from '../../lib/appUrls';

/** Legacy /dashboard2/pro → app entry (subdomain hop when configured). */
const RedirectToApp: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const target = getAppEntryPath() + location.search;
    const inApp = goToApp(target, true);
    if (inApp) navigate(inApp, { replace: true });
  }, [location.search, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen auth-page">
      <p className="text-[#71717a] text-sm">Opening app…</p>
    </div>
  );
};

export default RedirectToApp;
