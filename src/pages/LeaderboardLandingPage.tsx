import React, { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import CookieConsent from '../components/ui/CookieConsent';
import LeaderboardLiveTable from '../components/landing/LeaderboardLiveTable';
import MarketingSeo from '../components/seo/MarketingSeo';
import { LEADERBOARD_PAGE, LEADERBOARD_PAGE_FAQS } from '../lib/seo/leaderboardContent';
import { goToOpenApp } from '../lib/appUrls';

const LeaderboardLandingPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-gmx landing-leaderboard-page-root">
      <MarketingSeo path="/leaderboard" faqs={[...LEADERBOARD_PAGE_FAQS]} />
      <LandingNav variant="light" layout="gmx" />

      <main className="landing-leaderboard-page landing-gmx-gutter">
        <div className="landing-gmx-shell landing-leaderboard-page-shell">
          <div className="landing-leaderboard-page-grid">
            <header className="landing-leaderboard-page-head">
              <p className="landing-leaderboard-page-eyebrow">{LEADERBOARD_PAGE.eyebrow}</p>
              <h1 className="landing-leaderboard-page-title">{LEADERBOARD_PAGE.title}</h1>
              <p className="landing-leaderboard-page-tagline">{LEADERBOARD_PAGE.tagline}</p>
            </header>

            <aside className="landing-leaderboard-page-aside landing-glass-card">
              <p className="landing-leaderboard-page-desc">{LEADERBOARD_PAGE.description}</p>
              <ul className="landing-leaderboard-page-points">
                <li>Non-custodial — your keys, your Hyperliquid wallet</li>
                <li>Masked wallets here; verify full address on HypurrScan</li>
                <li>Fees only on profitable bot closes</li>
              </ul>
              <button
                type="button"
                className="landing-gmx-btn-primary landing-leaderboard-page-cta"
                onClick={() => goToOpenApp('?section=bot', false)}
              >
                Start bot
                <ArrowRight size={16} aria-hidden />
              </button>
            </aside>

            <div className="landing-leaderboard-page-table-panel landing-glass-card">
              <div className="landing-leaderboard-page-table-head">
                <span className="landing-leaderboard-page-live-dot" aria-hidden />
                <span>{LEADERBOARD_PAGE.tableMeta}</span>
              </div>
              <LeaderboardLiveTable
                limit={15}
                emptyMessage={LEADERBOARD_PAGE.tableEmpty}
                loadingMessage={LEADERBOARD_PAGE.tableLoading}
              />
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default LeaderboardLandingPage;
