import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isLegacyAppPath, redirectLegacyToProTrade } from '../../lib/appUrls';

/** Legacy dashboard1, dashboard2, /app → Pro Trade at `/`. */
export default function HostRedirects() {
  const location = useLocation();

  useEffect(() => {
    if (isLegacyAppPath(location.pathname)) {
      redirectLegacyToProTrade(location.pathname, location.search, true);
    }
  }, [location.pathname, location.search]);

  return null;
}
