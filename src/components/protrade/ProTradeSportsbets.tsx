import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
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
      <div className="hl-terminal hl-terminal--sb">
        <div className="hl-sportsbets-state" role="status">
          <Loader2 size={20} className="hl-spin" aria-hidden />
          <span>Checking eligibility…</span>
        </div>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="hl-terminal hl-terminal--sb">
        <div className="hl-sportsbets">
          <header className="hl-sb-head">
            <div className="hl-sb-head-copy">
              <h1 className="hl-sb-head-title">Betting</h1>
            </div>
          </header>
          <div className="hl-sb-panel hl-sb-panel--alert" role="alert">
            <AlertCircle size={18} strokeWidth={2} aria-hidden />
            <div>
              <p className="hl-sb-panel-title">Not available in your region</p>
              <p className="hl-sb-muted">{access.reason}</p>
              {access.countryLabel ? (
                <p className="hl-sb-muted">Detected: {access.countryLabel}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hl-terminal hl-terminal--sb">
      <SportsbetsTerminal
        walletAddress={resolvedAddress}
        walletConnected={walletConnected}
        signedIn={Boolean(user)}
        userId={user?.id}
        onRequireSignIn={onRequireSignIn}
      />
    </div>
  );
};

export default ProTradeSportsbets;
