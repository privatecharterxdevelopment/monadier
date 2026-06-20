import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Trophy } from 'lucide-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserLocale } from '../../hooks/useUserLocale';
import { canAccessSportsbets } from '../../lib/compliance/predictionMarketAccess';
import { supabase } from '../../lib/supabase';
import SportsbetsTerminal from './sportsbets/SportsbetsTerminal';

type Props = {
  walletConnected: boolean;
  walletAddress?: string;
  onRequireSignIn?: (reason: string) => void;
};

const ProTradeSportsbets: React.FC<Props> = ({
  walletConnected,
  walletAddress,
  onRequireSignIn,
}) => {
  const { user } = useAuth();
  const { address } = useAppKitAccount();
  const locale = useUserLocale();
  const [profileCountry, setProfileCountry] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(user?.id));

  useEffect(() => {
    if (!user?.id) {
      setProfileCountry(null);
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    supabase
      .from('profiles')
      .select('country')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfileCountry(typeof data?.country === 'string' ? data.country : null);
        setProfileLoading(false);
      })
      .catch(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const access = useMemo(
    () =>
      canAccessSportsbets({
        profileCountry,
        ipCountry: locale.country,
      }),
    [profileCountry, locale.country]
  );

  const loading = profileLoading || locale.loading;
  const resolvedAddress = walletAddress ?? address ?? undefined;

  if (loading) {
    return (
      <div className="hl-terminal">
        <div className="hl-sportsbets-state" role="status">
          <Loader2 size={20} className="hl-spin" aria-hidden />
          <span>Checking eligibility…</span>
        </div>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="hl-terminal">
        <div className="hl-sportsbets">
          <header className="hl-sportsbets-header">
            <div className="hl-sportsbets-title-row">
              <Trophy size={22} strokeWidth={2} aria-hidden />
              <h1 className="hl-sportsbets-title">Betting</h1>
            </div>
          </header>
          <div className="hl-sportsbets-blocked" role="alert">
            <AlertCircle size={22} strokeWidth={2} aria-hidden />
            <div>
              <p className="hl-sportsbets-blocked-title">Not available in your region</p>
              <p className="hl-sportsbets-blocked-msg">{access.reason}</p>
              {access.countryLabel ? (
                <p className="hl-sportsbets-blocked-meta">Detected: {access.countryLabel}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user && onRequireSignIn) {
    return (
      <div className="hl-terminal">
        <div className="hl-sportsbets">
          <div className="hl-sportsbets-state">
            <p>Sign in to use Betting.</p>
            <button
              type="button"
              className="hl-sportsbets-cta"
              onClick={() => onRequireSignIn('Sign in to use Betting.')}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hl-terminal">
      <SportsbetsTerminal
        walletAddress={resolvedAddress}
        walletConnected={walletConnected}
        userId={user?.id}
      />
    </div>
  );
};

export default ProTradeSportsbets;
