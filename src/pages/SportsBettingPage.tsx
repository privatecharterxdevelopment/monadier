import React, { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import LandingHeroLines from '../components/landing/LandingHeroLines';
import LandingBetMarketCards from '../components/landing/LandingBetMarketCards';
import BettingFaqSection from '../components/landing/BettingFaqSection';
import CookieConsent from '../components/ui/CookieConsent';
import {
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingSectionHeading,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import {
  MktWalletVisual,
  MktBettingVisual,
  MktCashOutVisual,
} from '../components/marketing/MarketingIllustrations';
import MarketingSeo from '../components/seo/MarketingSeo';
import { goToOpenApp } from '../lib/appUrls';

const BETTING_ROTATE_LINES = [
  'bet on World Cup',
  'bet on football',
  'bet on Basketball',
  'bet on Market moves',
  'and more',
] as const;

const steps = [
  {
    title: 'Connect & fund',
    text: 'Sign in with your wallet and deposit USDC to your Hyperliquid spot balance for outcome markets.',
    visual: <MktWalletVisual />,
  },
  {
    title: 'Pick a market',
    text: 'Open Betting in the app, browse leagues and events, and select Yes or No at live odds.',
    visual: <MktBettingVisual />,
  },
  {
    title: 'Track & cash out',
    text: 'Monitor open bets, sell early when liquidity is available, or hold until the market settles.',
    visual: <MktCashOutVisual />,
  },
];

const SportsBettingPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-gmx">
      <MarketingSeo path="/sports-betting" />
      <LandingNav variant="light" layout="gmx" />

      <section className="landing-gmx-hero landing-gmx-gutter landing-gmx-hero--subpage">
        <div className="landing-gmx-shell landing-gmx-hero-shell landing-gmx-hero-shell--subpage">
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

      <LandingBetMarketCards
        limit={8}
        title="Live events"
        subtitle="Real HIP-4 markets on Hyperliquid — odds refresh every 30 seconds. Team matchups show live flags where available."
      />

      <main className="landing-gmx-page-main landing-gmx-page-main--inner landing-gmx-gutter">
        <div className="landing-gmx-shell">
          <div className="mkt-page">
          <MarketingSectionHeading
            title="How it works"
            sub="Three steps from wallet to your first on-chain sports bet."
          />

          <MarketingPageGrid columns={3}>
            {steps.map((step, i) => (
              <MarketingFeatureCard
                key={step.title}
                index={i}
                title={step.title}
                text={step.text}
                visual={step.visual}
              />
            ))}
          </MarketingPageGrid>

          <MarketingDisclaimer>
            Sports betting involves risk. Outcome markets can lose value; only bet what you can afford
            to lose. This is not financial advice.
          </MarketingDisclaimer>
          </div>
        </div>
      </main>

      <BettingFaqSection />

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default SportsBettingPage;
