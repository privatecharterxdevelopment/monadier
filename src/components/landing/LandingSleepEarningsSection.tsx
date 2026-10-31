import React from 'react';
import { useTranslation } from 'react-i18next';
import LandingBotLeaderboardWidget from './widgets/LandingBotLeaderboardWidget';

/**
 * Same sleep frame as before (width/height) — live on-chain leaderboard
 * instead of the fake iPhone. Title above the frame; no pills.
 */
const LandingSleepEarningsSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section
      id="landing-sleep-earnings-section"
      className="landing-sleep-section landing-sleep-section--lb landing-gmx-section"
      aria-labelledby="landing-sleep-earnings-title"
    >
      <div className="landing-gmx-gutter landing-gmx-shell">
        <div className="landing-sleep-stack">
          <h2 id="landing-sleep-earnings-title" className="landing-sleep-lb-title">
            {t('landing.sleepEarnings.title')}
          </h2>

          <div className="landing-sleep-frame landing-sleep-frame--lb">
            <div className="landing-sleep-lb-fill">
              <LandingBotLeaderboardWidget
                variant="hero"
                limit={10}
                className="landing-sleep-lb-widget"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingSleepEarningsSection;
