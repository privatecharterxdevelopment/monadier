import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Supabase auth links often land on `/` (Site URL) instead of `/auth/callback` or `/reset-password`.
 * Forward codes and hash tokens to the route that can finish the flow.
 */
export default function AuthOAuthCapture() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hash = location.hash;
    const hasCode = Boolean(params.get('code'));
    const hasTokenHash = Boolean(params.get('token_hash'));
    const hasHashToken =
      hash.includes('access_token') || hash.includes('type=recovery');

    if (!hasCode && !hasTokenHash && !hasHashToken) return;
    if (location.pathname === '/auth/callback' || location.pathname === '/reset-password') {
      return;
    }

    const recoveryHint =
      params.get('type') === 'recovery' ||
      params.get('recovery') === '1' ||
      hash.includes('type=recovery');

    const target = recoveryHint
      ? `/reset-password${location.search}${hash}`
      : `/auth/callback${location.search}${hash}`;

    navigate(target, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
