import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import CookieConsent from '../components/ui/CookieConsent';
import MarketingSeo from '../components/seo/MarketingSeo';
import LegacyVaultWithdraw from '../components/vault/LegacyVaultWithdraw';
import { LEGACY_VAULT_PAYOUT_ENABLED } from '../lib/legacyVaultRegistry';

const EmergencyVaultWithdrawPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!LEGACY_VAULT_PAYOUT_ENABLED) {
    return (
      <div className="landing-gmx min-h-[100dvh]">
        <MarketingSeo path="/legacy-vault-withdraw" />
        <LandingNav variant="light" layout="gmx" />
        <main className="landing-gmx-page-main landing-gmx-gutter">
          <div className="landing-gmx-shell mkt-page">
            <h1 className="mkt-hero-title">Legacy vault payout</h1>
            <p className="mkt-hero-lead">This temporary payout page is not enabled on this deployment.</p>
            <Link to="/support" className="mkt-cta-secondary">
              Contact support
            </Link>
          </div>
        </main>
        <LandingFooter />
        <CookieConsent />
      </div>
    );
  }

  return (
    <div className="landing-gmx min-h-[100dvh]">
      <MarketingSeo path="/legacy-vault-withdraw" />
      <LandingNav variant="light" layout="gmx" />
      <main className="landing-gmx-page-main landing-gmx-page-main--inner landing-gmx-gutter">
        <div className="landing-gmx-shell">
          <div className="mkt-page">
            <header className="mkt-hero-band landing-glass-card legacy-vault-payout-hero">
              <p className="mkt-hero-eyebrow">Temporary · Arbitrum only</p>
              <h1 className="mkt-hero-title">Legacy vault emergency payout</h1>
              <p className="mkt-hero-lead">
                If you deposited USDC into an older Monadier on-chain vault, connect the same wallet
                you used back then. We scan every legacy contract and let you withdraw or emergency-withdraw
                your credited balance.
              </p>
              <p className="mkt-hero-sub">
                Use Arbitrum One. You sign the withdrawal — funds go directly to your wallet. No Monadier
                admin action required.
              </p>
            </header>

            <LegacyVaultWithdraw mode="page" />

            <p className="legacy-vault-payout-foot">
              Need help?{' '}
              <Link to="/support" className="legacy-vault-payout-link">
                Open support
              </Link>{' '}
              and mention your wallet address.
            </p>
          </div>
        </div>
      </main>
      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default EmergencyVaultWithdrawPage;
