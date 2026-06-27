import React from 'react';
import { ArrowRight } from 'lucide-react';
import LandingHeroLines from './LandingHeroLines';
import { goToOpenApp, getAppQueryLink } from '../../lib/appUrls';

const BOT_ROTATE_LINES = [
  '200+ markets',
  'runs 24/7',
  'trails profits',
] as const;

const BOT_VIDEO_SRC = '/videos/pitch-bg.mp4';

const BotVideoHero: React.FC = () => (
  <section
    className="landing-gmx-hero landing-gmx-hero--centered landing-gmx-hero--betting landing-gmx-hero--bot landing-gmx-gutter"
    aria-label="Hyperliquid trading bot"
  >
    <div className="landing-gmx-shell landing-gmx-hero-shell landing-gmx-hero-shell--betting">
      <div className="landing-gmx-hero-stage landing-gmx-hero-stage--betting">
        <div className="landing-gmx-hero-viewport landing-gmx-hero-viewport--betting">
          <div className="landing-gmx-hero-video-zoom landing-gmx-hero-video-zoom--betting" aria-hidden>
            <video
              className="landing-gmx-hero-video"
              src={BOT_VIDEO_SRC}
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
                lineDarkTop="Trading bot,"
                rotateLines={BOT_ROTATE_LINES}
                rotatePosition="two-row"
                rotateSuffix="on Hyperliquid"
                className="landing-betting-hero-lines"
              />
            </div>
            <div className="landing-betting-hero-meta">
              <p className="landing-betting-hero-lead">
                Deposit USDC on Hyperliquid, approve the agent once, and let Monadier scan every HL
                perpetual 24/7 — non-custodial, server-side automation.
              </p>
              <a
                href={getAppQueryLink('section=bot')}
                className="landing-gmx-btn-primary landing-betting-hero-cta"
                onClick={(e) => {
                  e.preventDefault();
                  goToOpenApp('?section=bot', false);
                }}
              >
                Start bot
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

export default BotVideoHero;
