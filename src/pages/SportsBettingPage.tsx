import React from 'react';
import LandingPageShell from '../components/landing/LandingPageShell';
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
import { useLandingTheme } from '../contexts/LandingThemeContext';

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
  const { theme } = useLandingTheme();

  return (
    <div className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${theme}`}>
      <MarketingSeo path="/ai-sports-betting" faqs={BETTING_FAQS} />
      <LandingPageShell afterContent={<MarketingPageBottomCta />}>
        <BettingVideoHero />

        <LandingBetMarketCards
          limit={4}
          layout="page"
          flushTop
          ariaLabel="Live Hyperliquid betting markets"
        />

        <main className="landing-gmx-page-main landing-gmx-page-main--framed landing-gmx-page-main--inner landing-gmx-gutter">
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
      </LandingPageShell>
      <CookieConsent />
    </div>
  );
};

export default SportsBettingPage;
