import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import BettingVideoHero from '../components/landing/BettingVideoHero';
import LandingBetMarketCards from '../components/landing/LandingBetMarketCards';
import BettingBenefitsList from '../components/landing/BettingBenefitsList';
import BettingFaqSection from '../components/landing/BettingFaqSection';
import CookieConsent from '../components/ui/CookieConsent';
import MarketingBotPromo from '../components/marketing/MarketingBotPromo';
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
import { BETTING_FAQS } from '../lib/seo/bettingContent';

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
      <MarketingSeo path="/sports-betting" faqs={BETTING_FAQS} />
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

            <div className="mkt-cta-row">
              <Link to="/trading-bot" className="mkt-cta-secondary">
                Hyperliquid trading bot
                <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <Link to="/pricing" className="mkt-cta-secondary">
                View pricing
              </Link>
            </div>

            <MarketingDisclaimer>
              Sports betting involves risk. Outcome markets can lose value; only bet what you can afford
              to lose. This is not financial advice.
            </MarketingDisclaimer>
          </div>
        </div>
      </main>

      <BettingFaqSection />

      <div className="landing-gmx-gutter landing-gmx-section landing-betting-bot-promo">
        <div className="landing-gmx-shell">
          <MarketingBotPromo kicker="Also on Monadier" />
        </div>
      </div>

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default SportsBettingPage;
