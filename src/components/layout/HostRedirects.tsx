import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getAppEntryPath,
  getOpenAppPath,
  goToOpenApp,
  isAppHost,
  OPEN_APP_PATH,
} from '../../lib/appUrls';

/**
 * App subdomain: / serves Pro Trade (RootRoute).
 * Marketing: legacy /dashboard2* → /app (Pro Trade).
 */
export default function HostRedirects() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (
      !isAppHost() &&
      (location.pathname === '/dashboard2' || location.pathname.startsWith('/dashboard2/'))
    ) {
      const inApp = goToOpenApp(location.search, true);
      if (inApp) navigate(inApp, { replace: true });
      return;
    }

    if (isAppHost() && location.pathname === '/dashboard2') {
      navigate(getAppEntryPath() + location.search, { replace: true });
      return;
    }

    if (
      isAppHost() &&
      (location.pathname === OPEN_APP_PATH || location.pathname.startsWith(`${OPEN_APP_PATH}/`))
    ) {
      navigate(getOpenAppPath() + location.search, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return null;
}
