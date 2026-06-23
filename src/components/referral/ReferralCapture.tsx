import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { captureReferralFromSearch } from '../../lib/referralCapture';

/**
 * Standard referral capture: ?ref=CODE (or ?referral=) on ANY route → localStorage.
 * Cleans the URL so shared links look normal after landing.
 */
const ReferralCapture: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hasRef = params.has('ref') || params.has('referral');
    if (!hasRef) return;

    const captured = captureReferralFromSearch(location.search);
    if (!captured) return;

    params.delete('ref');
    params.delete('referral');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
        hash: location.hash,
      },
      { replace: true }
    );
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
};

export default ReferralCapture;
