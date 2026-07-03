import React, { useEffect, useMemo, useState } from 'react';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useAuth } from '../../contexts/AuthContext';
import { useUserLocale } from '../../hooks/useUserLocale';
import { canAccessSportsbets } from '../../lib/compliance/predictionMarketAccess';
import { supabase } from '../../lib/supabase';
import SportsbetsTerminal from './sportsbets/SportsbetsTerminal';
import SportsbetsRegionBlocked from './sportsbets/SportsbetsRegionBlocked';
import SportsbetsRegionLoading from './sportsbets/SportsbetsRegionLoading';

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
  const { address } = useMonadierWallet();
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

  const loading =
    Boolean(user?.id && profileLoading) ||
    (locale.loading && profileCountry == null);
  const resolvedAddress = walletAddress ?? address ?? undefined;

  if (loading) {
    return (
      <div className="hl-terminal hl-terminal--sb">
        <SportsbetsRegionLoading />
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="hl-terminal hl-terminal--sb">
        <SportsbetsRegionBlocked reason={access.reason} countryLabel={access.countryLabel} />
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
