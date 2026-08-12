import React from 'react';
import LandingPageShell from '../components/landing/LandingPageShell';
import CookieConsent from '../components/ui/CookieConsent';
import LeaderboardLiveTable from '../components/landing/LeaderboardLiveTable';
import MarketingSeo from '../components/seo/MarketingSeo';
import { LEADERBOARD_PAGE, LEADERBOARD_PAGE_FAQS } from '../lib/seo/leaderboardContent';
import { useLandingTheme } from '../contexts/LandingThemeContext';

/** Simple framed leaderboard — live verified bot wins, nothing else. */
const LeaderboardLandingPage: React.FC = () => {
  const { theme } = useLandingTheme();

  return (
    <div className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${theme}`}>
      <MarketingSeo path="/leaderboard" faqs={[...LEADERBOARD_PAGE_FAQS]} />
      <LandingPageShell>
        <main className="landing-gmx-page-main landing-gmx-page-main--framed landing-gmx-page-main--inner landing-gmx-gutter landing-lb-page-main">
          <div className="landing-gmx-shell landing-lb-page-shell">
            <div className="landing-lb-simple">
              <header className="landing-lb-simple-head">
                <h1 className="landing-lb-simple-title">
                  Leaderboard{' '}
                  <span className="landing-gmx-title-grey">on chain</span>
                </h1>
                <p className="landing-lb-simple-lead">
                  Live Hyperliquid L1 fills — masked wallets here, full addresses on HypurrScan.
                </p>
              </header>

              <div className="landing-lb-simple-panel">
                <div className="landing-lb-simple-meta">
                  <span className="landing-leaderboard-page-live-dot" aria-hidden />
                  <span>{LEADERBOARD_PAGE.tableMeta}</span>
                </div>
                <LeaderboardLiveTable
                  limit={20}
                  emptyMessage={LEADERBOARD_PAGE.tableEmpty}
                  loadingMessage={LEADERBOARD_PAGE.tableLoading}
                  className="landing-lb-simple-table"
                />
              </div>
            </div>
          </div>
        </main>
      </LandingPageShell>
      <CookieConsent />
    </div>
  );
};

export default LeaderboardLandingPage;
