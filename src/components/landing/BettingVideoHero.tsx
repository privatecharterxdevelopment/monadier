import React from 'react';
import { ArrowRight } from 'lucide-react';
import LandingHeroLines from './LandingHeroLines';
import { goToOpenApp, getAppQueryLink } from '../../lib/appUrls';
import { useLandingTheme } from '../../contexts/LandingThemeContext';

const BETTING_ROTATE_LINES = [
  'bet on World Cup',
  'bet on football',
  'bet on Basketball',
  'bet on Market moves',
  'and more',
] as const;

const BETTING_VIDEO_SRC = '/videos/sports-betting-hero.mp4';

/** Same framed video window as main landing — static, no scroll zoom. */
const BettingVideoHero: React.FC = () => {
  const { isLight } = useLandingTheme();

  return (
    <section
      className={`landing-gmx-hero landing-gmx-hero--centered landing-gmx-hero--betting landing-gmx-hero--betting-bleed${
        isLight ? ' landing-gmx-hero--theme-light' : ' landing-gmx-hero--theme-dark'
      }`}
      aria-label="Sports betting on Hyperliquid"
    >
      <div className="landing-gmx-hero-shell landing-gmx-hero-shell--betting">
        <div className="landing-gmx-hero-stage landing-gmx-hero-stage--betting">
          <div className="landing-gmx-hero-viewport landing-gmx-hero-viewport--betting">
            <div className="landing-gmx-hero-video-zoom landing-gmx-hero-video-zoom--betting" aria-hidden>
              <video
                className={`landing-gmx-hero-video${isLight ? ' landing-gmx-hero-video--light' : ''}`}
                src={BETTING_VIDEO_SRC}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
              />
            </div>

            <div className="landing-gmx-hero-chrome landing-gmx-hero-chrome--betting">
              <div className="landing-gmx-hero-chrome-spacer" aria-hidden />
              <div className="landing-gmx-hero-chrome-title">
                <LandingHeroLines
                  lineDarkTop="Prediction market,"
                  rotateLines={BETTING_ROTATE_LINES}
                  rotatePosition="two-row"
                  rotateSuffix="on chain"
                  tightRotateSuffix
                  className="landing-betting-hero-lines"
                />
              </div>
              <div className="landing-betting-hero-meta">
                <p className="landing-betting-hero-lead">
                  HIP-4 outcome markets on Hyperliquid — wallet-signed bets, live odds, and
                  transparent on-chain settlement.
                </p>
                <a
                  href={getAppQueryLink('section=sportsbets')}
                  className="landing-gmx-btn-primary landing-betting-hero-cta"
                  onClick={(e) => {
                    e.preventDefault();
                    goToOpenApp('?section=sportsbets', false);
                  }}
                >
                  Open betting
                  <ArrowRight size={16} aria-hidden />
                </a>
              </div>
              <div className="landing-gmx-hero-chrome-spacer" aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BettingVideoHero;
