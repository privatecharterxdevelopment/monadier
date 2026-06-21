import React from 'react';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import ProTradeBettingTables from '../protrade/ProTradeBettingTables';
import { useBettingPortfolio } from '../../hooks/useBettingPortfolio';

const ProfileBettingPanel: React.FC = () => {
  const { address, isConnected } = useMonadierWallet();
  const betting = useBettingPortfolio({
    walletAddress: address ?? undefined,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <p className="term-profile-muted">Connect your wallet to sync betting positions.</p>;
  }

  return (
    <ProTradeBettingTables
      openBets={betting.openBets}
      closedBets={betting.closedBets}
      loading={betting.loading}
      syncing={betting.syncing}
      signedIn={betting.signedIn}
      showSummary
      summary={betting.summary}
      compact
    />
  );
};

export default ProfileBettingPanel;
