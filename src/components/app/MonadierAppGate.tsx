import React, { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Logo from '../ui/Logo';

type Props = {
  children: React.ReactNode;
};

/**
 * App shell — always show Pro Trade. Sign-in and wallet connect are gated per action
 * (trade, bot start, profile, etc.) inside Dashboard2ProPage.
 */
const MonadierAppGate: React.FC<Props> = ({ children }) => {
  const { isLoading, sessionReady } = useAuth();

  useEffect(() => {
    document.title = 'Monadier · app.monadier.com';
  }, []);

  if (!sessionReady || isLoading) {
    return (
      <div className="monadier-app-gate">
        <div className="monadier-app-gate-card">
          <Logo size="md" theme="light" />
          <p className="monadier-app-gate-text">Loading terminal…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default MonadierAppGate;
