import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getAppEntryPath,
  getAppUrl,
  goToApp,
  isAppHost,
  isExternalAppUrl,
} from '../../lib/appUrls';

/**
 * App subdomain: / serves Pro Trade (RootRoute).
 * Marketing + VITE_APP_URL: /app and /dashboard2/pro → app subdomain.
 */
export default function HostRedirects() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAppHost() && !isExternalAppUrl(getAppUrl())) return;

    if (
      !isAppHost() &&
      isExternalAppUrl(getAppUrl()) &&
      (location.pathname === '/app' ||
        location.pathname.startsWith('/app/') ||
        location.pathname === '/dashboard2/pro' ||
        location.pathname.startsWith('/dashboard2/pro/'))
    ) {
      goToApp(getAppEntryPath() + location.search, true);
      return;
    }

    if (isAppHost() && location.pathname === '/dashboard2') {
      navigate(getAppEntryPath(), { replace: true });
      return;
    }

    if (
      isAppHost() &&
      (location.pathname === '/app' ||
        location.pathname.startsWith('/app/') ||
        location.pathname.startsWith('/dashboard2/'))
    ) {
      navigate(getAppEntryPath() + location.search, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return null;
}
