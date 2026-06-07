import React, { useEffect } from 'react';
import { Wallet, LogIn, UserPlus } from 'lucide-react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import Logo from '../ui/Logo';
import { useAuth } from '../../contexts/AuthContext';
import { enableDemoMode, isDemoModeAllowed, isDemoModeEnabled } from '../../lib/demoMode';
import { getLoginUrl, getRegisterUrl } from '../../lib/appUrls';

type Props = {
  children: React.ReactNode;
};

const MonadierAppGate: React.FC<Props> = ({ children }) => {
  const { isAuthenticated, isLoading, sessionReady, isDemoUser } = useAuth();
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();

  const demoBypass = isDemoModeAllowed() && isDemoModeEnabled();
  const walletReady = isConnected || isDemoUser;

  useEffect(() => {
    document.title = 'Monadier · app.monadier.com';
  }, []);

  if (demoBypass) {
    return <>{children}</>;
  }

  if (!sessionReady || isLoading) {
    return (
      <div className="monadier-app-gate">
        <div className="monadier-app-gate-card">
          <Logo size="md" theme="light" />
          <p className="monadier-app-gate-text">Restoring your session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="monadier-app-gate">
        <div className="monadier-app-gate-card">
          <Logo size="md" theme="light" />
          <p className="monadier-app-gate-kicker">app.monadier.com</p>
          <h1 className="monadier-app-gate-title">Sign in to open the terminal</h1>
          <p className="monadier-app-gate-text">
            Perps, spot, vault bot, and portfolio — one workspace after you sign in and connect
            your wallet.
          </p>
          <div className="monadier-app-gate-actions">
            <a href={getLoginUrl()} className="monadier-app-gate-btn monadier-app-gate-btn--primary">
              <LogIn size={16} />
              Sign in
            </a>
            <a href={getRegisterUrl()} className="monadier-app-gate-btn">
              <UserPlus size={16} />
              Create account
            </a>
          </div>
          {isDemoModeAllowed() && (
            <button
              type="button"
              className="monadier-app-gate-demo"
              onClick={() => {
                enableDemoMode();
                window.location.reload();
              }}
            >
              Continue in demo mode (dev)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!walletReady) {
    return (
      <div className="monadier-app-gate">
        <div className="monadier-app-gate-card">
          <Logo size="md" theme="light" />
          <p className="monadier-app-gate-kicker">app.monadier.com</p>
          <h1 className="monadier-app-gate-title">Connect your wallet</h1>
          <p className="monadier-app-gate-text">
            You&apos;re signed in. Connect a wallet to trade on Hyperliquid and run the vault bot on
            Arbitrum.
          </p>
          <button
            type="button"
            className="monadier-app-gate-btn monadier-app-gate-btn--primary w-full"
            onClick={() => open()}
          >
            <Wallet size={16} />
            Connect wallet
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default MonadierAppGate;
