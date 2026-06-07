import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { goToOpenApp } from '../../lib/appUrls';

/**
 * Legacy /dashboard2*, /app* → Pro Trade at `/`.
 */
export default function HostRedirects() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (
      path === '/dashboard2' ||
      path.startsWith('/dashboard2/') ||
      path === '/app' ||
      path.startsWith('/app/')
    ) {
      goToOpenApp(location.search, true);
    }
  }, [location.pathname, location.search]);

  return null;
}
