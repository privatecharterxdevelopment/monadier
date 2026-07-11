import React, { useEffect } from 'react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import BettingVideoHero from '../components/landing/BettingVideoHero';
import LandingBetMarketCards from '../components/landing/LandingBetMarketCards';
import BettingBenefitsList from '../components/landing/BettingBenefitsList';
import BettingFaqSection from '../components/landing/BettingFaqSection';
import CookieConsent from '../components/ui/CookieConsent';
import MarketingPageBottomCta from '../components/marketing/MarketingPageBottomCta';
import {
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingSectionHeading,
} from '../components/marketing/MarketingInnerPage';
import {
  SportsBetConnectVisual,
  SportsBetPickVisual,
  SportsBetCashOutVisual,
} from '../components/landing/SportsBettingHowItWorksVisuals';
import MarketingSeo from '../components/seo/MarketingSeo';
import { BETTING_FAQS } from '../lib/seo/bettingContent';

const steps = [
  {
    title: 'Connect & fund',
    text: 'Sign in with your wallet and deposit USDC to your Hyperliquid spot balance for outcome markets.',
    visual: <SportsBetConnectVisual />,
  },
  {
    title: 'Pick a market',
    text: 'Open Betting in the app, browse leagues and events, and select Yes or No at live odds.',
    visual: <SportsBetPickVisual />,
  },
  {
    title: 'Track & cash out',
    text: 'Monitor open bets, sell early when liquidity is available, or hold until the market settles.',
    visual: <SportsBetCashOutVisual />,
  },
];

const SportsBettingPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-gmx">
      <MarketingSeo path="/ai-sports-betting" faqs={BETTING_FAQS} />
      <LandingNav variant="light" layout="gmx" />

      <BettingVideoHero />

      <LandingBetMarketCards limit={8} layout="page" flushTop ariaLabel="Live Hyperliquid betting markets" />

      <main className="landing-gmx-page-main landing-gmx-page-main--inner landing-gmx-gutter">
        <div className="landing-gmx-shell">
          <div className="mkt-page">
            <BettingBenefitsList />

            <MarketingSectionHeading
              title="How sports betting works"
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
          </div>
        </div>
      </main>

      <BettingFaqSection />

      <MarketingPageBottomCta />

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default SportsBettingPage;
