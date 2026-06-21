import React, { useEffect } from 'react';
import { ArrowRight, Shield, Trophy, Wallet, Zap } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import LandingHeroLines from '../components/landing/LandingHeroLines';
import CookieConsent from '../components/ui/CookieConsent';
import {
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingSectionHeading,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import { goToOpenApp } from '../lib/appUrls';

const BETTING_ROTATE_LINES = [
  'bet on World Cup',
  'bet on football',
  'bet on Basketball',
  'bet on Market moves',
  'and more',
] as const;

const highlights = [
  {
    icon: Trophy,
    title: 'Verified sports markets',
    text: 'Browse live and upcoming sports events listed as Hyperliquid HIP-4 outcome markets — odds update on-chain as the book moves.',
  },
  {
    icon: Wallet,
    title: 'Non-custodial betting',
    text: 'Your USDC stays on your Hyperliquid account. Orders are wallet-signed; Monadier never holds your private keys.',
  },
  {
    icon: Zap,
    title: 'Fast on-chain execution',
    text: 'Place Yes/No bets directly on Hyperliquid outcome contracts. Open positions, cash out, and track P/L in the app.',
  },
  {
    icon: Shield,
    title: 'Transparent settlement',
    text: 'Markets resolve on verified outcomes. Positions and balances are visible on Hyperliquid — no opaque bookmaker ledger.',
  },
];

const steps = [
  {
    title: 'Connect & fund',
    text: 'Sign in with your wallet and deposit USDC to your Hyperliquid spot balance for outcome markets.',
  },
  {
    title: 'Pick a market',
    text: 'Open Betting in the app, browse leagues and events, and select Yes or No at live odds.',
  },
  {
    title: 'Track & cash out',
    text: 'Monitor open bets, sell early when liquidity is available, or hold until the market settles.',
  },
];

const SportsBettingPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-gmx">
      <LandingNav variant="light" layout="gmx" />

      <section className="landing-gmx-hero landing-gmx-hero--subpage">
        <div className="landing-gmx-hero-shell landing-gmx-hero-shell--subpage">
          <div className="landing-gmx-hero-stage">
            <div className="landing-gmx-hero-stack landing-gmx-hero-stack--subpage">
              <LandingHeroLines
                lineDarkTop="Prediction market,"
                rotateLines={BETTING_ROTATE_LINES}
                lineDarkBottom="on chain"
              />
              <div className="landing-gmx-hero-bottom landing-gmx-hero-bottom--subpage">
                <div className="landing-gmx-hero-bottom-left">
                  <div className="landing-gmx-hero-cta">
                    <a
                      href="/?section=sportsbets"
                      className="landing-gmx-btn-primary"
                      onClick={(e) => {
                        e.preventDefault();
                        goToOpenApp('?section=sportsbets', false);
                      }}
                    >
                      Open betting
                      <ArrowRight size={16} />
                    </a>
                  </div>
                  <p className="landing-gmx-hero-lead">
                    HIP-4 outcome markets on Hyperliquid — wallet-signed bets, live odds, and
                    transparent on-chain settlement.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="landing-gmx-page-main landing-gmx-page-main--inner landing-gmx-page-main--tight-top">
        <div className="mkt-page">
          <MarketingPageGrid columns={2}>
            {highlights.map((item, i) => (
              <MarketingFeatureCard
                key={item.title}
                index={i}
                title={item.title}
                text={item.text}
                icon={item.icon}
              />
            ))}
          </MarketingPageGrid>

          <MarketingSectionHeading
            title="How it works"
            sub="Three steps from wallet to your first on-chain sports bet."
          />

          <MarketingPageGrid columns={3} className="mkt-grid-follow">
            {steps.map((step, i) => (
              <MarketingFeatureCard key={step.title} index={i} title={step.title} text={step.text} />
            ))}
          </MarketingPageGrid>

          <MarketingDisclaimer>
            Sports betting involves risk. Outcome markets can lose value; only bet what you can afford
            to lose. This is not financial advice.
          </MarketingDisclaimer>
        </div>
      </main>

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default SportsBettingPage;
