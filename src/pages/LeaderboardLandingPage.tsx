import React from 'react';
import { useTranslation } from 'react-i18next';
import LandingPageShell from '../components/landing/LandingPageShell';
import CookieConsent from '../components/ui/CookieConsent';
import LeaderboardLiveTable from '../components/landing/LeaderboardLiveTable';
import MarketingSeo from '../components/seo/MarketingSeo';
import { useLandingTheme } from '../contexts/LandingThemeContext';

/** Simple framed leaderboard — live verified bot wins, nothing else. */
const LeaderboardLandingPage: React.FC = () => {
  const { theme } = useLandingTheme();
  const { t } = useTranslation();

  const faqs = [
    {
      q: t('leaderboard.faqRealQ'),
      a: t('leaderboard.faqRealA'),
    },
    {
      q: t('leaderboard.faqFeesQ'),
      a: t('leaderboard.faqFeesA'),
    },
  ];

  return (
    <div className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${theme}`}>
      <MarketingSeo path="/leaderboard" faqs={faqs} />
      <LandingPageShell>
        <main className="landing-gmx-page-main landing-gmx-page-main--framed landing-gmx-page-main--inner landing-gmx-gutter landing-lb-page-main">
          <div className="landing-gmx-shell landing-lb-page-shell">
            <div className="landing-lb-simple">
              <header className="landing-lb-simple-head">
                <h1 className="landing-lb-simple-title">
                  {t('leaderboard.title')}{' '}
                  <span className="landing-gmx-title-grey">{t('leaderboard.onChain')}</span>
                </h1>
                <p className="landing-lb-simple-lead">{t('leaderboard.lead')}</p>
              </header>

              <div className="landing-lb-simple-panel">
                <div className="landing-lb-simple-meta">
                  <span className="landing-leaderboard-page-live-dot" aria-hidden />
                  <span>{t('leaderboard.recentAllMeta', { n: 20 })}</span>
                </div>
                <LeaderboardLiveTable
                  limit={20}
                  emptyMessage={t('leaderboard.emptyAll')}
                  loadingMessage={t('leaderboard.loading')}
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
