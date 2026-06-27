import React from 'react';
import { ArrowRight } from 'lucide-react';
import LandingHeroLines from './LandingHeroLines';
import { goToOpenApp } from '../../lib/appUrls';

const BETTING_ROTATE_LINES = [
  'World Cup',
  'football',
  'basketball',
  'crypto events',
  'macro markets',
] as const;

const BETTING_VIDEO_SRC = '/videos/14757485_1920_1080_25fps.mp4';

const BettingVideoHero: React.FC = () => (
  <section className="landing-betting-video-hero landing-gmx-gutter" aria-label="Sports betting on Hyperliquid">
    <div className="landing-betting-video-hero-media" aria-hidden>
      <video
        className="landing-betting-video-hero-video"
        src={BETTING_VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      />
      <div className="landing-betting-video-hero-overlay" />
    </div>

    <div className="landing-gmx-shell landing-betting-video-hero-inner">
      <div className="landing-betting-video-hero-copy">
        <LandingHeroLines
          lineDarkTop="Bet on"
          rotateLines={BETTING_ROTATE_LINES}
          lineDarkBottom="on Hyperliquid"
          rotatePosition="middle"
          className="landing-betting-video-hero-lines"
        />
        <p className="landing-betting-video-hero-lead">
          HIP-4 outcome markets — wallet-signed bets, live on-chain odds, and transparent
          settlement. Non-custodial USDC on Hyperliquid.
        </p>
        <div className="landing-betting-video-hero-cta">
          <a
            href="/?section=sportsbets"
            className="landing-gmx-btn-primary"
            onClick={(e) => {
              e.preventDefault();
              goToOpenApp('?section=sportsbets', false);
            }}
          >
            Open betting
            <ArrowRight size={16} aria-hidden />
          </a>
        </div>
      </div>
    </div>
  </section>
);

export default BettingVideoHero;
