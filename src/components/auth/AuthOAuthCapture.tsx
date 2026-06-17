import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Supabase OAuth sometimes lands on `/?code=...` (Site URL) instead of `/auth/callback`.
 * Forward the code to the callback route on whatever host the user is on.
 */
export default function AuthOAuthCapture() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.get('code')) return;
    if (location.pathname === '/auth/callback') return;

    const target = `/auth/callback${location.search}${location.hash}`;
    navigate(target, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
