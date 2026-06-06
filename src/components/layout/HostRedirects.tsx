import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAppUrl, goToApp, isAppHost, isExternalAppUrl } from '../../lib/appUrls';

/**
 * App subdomain: / → /dashboard2
 * Marketing + VITE_APP_URL: /dashboard2 → app subdomain (full load)
 */
export default function HostRedirects() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAppHost() && location.pathname === '/') {
      navigate('/dashboard2', { replace: true });
      return;
    }

    if (
      !isAppHost() &&
      isExternalAppUrl(getAppUrl('/dashboard2')) &&
      (location.pathname === '/dashboard2' || location.pathname.startsWith('/dashboard2/'))
    ) {
      goToApp(location.pathname + location.search, true);
    }
  }, [location.pathname, location.search, navigate]);

  return null;
}
