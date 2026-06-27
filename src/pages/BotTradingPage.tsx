import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import CookieConsent from '../components/ui/CookieConsent';
import BotVideoHero from '../components/landing/BotVideoHero';
import BotPageBento from '../components/landing/BotPageBento';
import BotBenefitsList from '../components/landing/BotBenefitsList';
import BotSetupSteps from '../components/landing/BotSetupSteps';
import BotPipelineSection from '../components/landing/BotPipelineSection';
import BotDetailsSection from '../components/landing/BotDetailsSection';
import MarketingFaqAccordion from '../components/marketing/MarketingFaqAccordion';
import MarketingSeo from '../components/seo/MarketingSeo';
import { MarketingDisclaimer, MarketingSectionHeading } from '../components/marketing/MarketingInnerPage';
import { TRADING_BOT_FAQS } from '../lib/seo/tradingBotContent';
import { goToOpenApp } from '../lib/appUrls';

const BotTradingPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-gmx">
      <MarketingSeo path="/trading-bot" faqs={TRADING_BOT_FAQS} />
      <LandingNav variant="light" layout="gmx" />

      <BotVideoHero />
      <BotPageBento />

      <main className="landing-gmx-page-main landing-gmx-page-main--inner landing-gmx-gutter">
        <div className="landing-gmx-shell">
          <div className="mkt-page">
            <BotBenefitsList />
            <BotSetupSteps />
            <BotDetailsSection />
            <BotPipelineSection />

            <MarketingSectionHeading
              title="Trading bot FAQ"
              sub="Setup, fees, non-custodial funds, and 24/7 automation on Hyperliquid."
            />

            <MarketingFaqAccordion items={TRADING_BOT_FAQS} idPrefix="trading-bot-faq" />

            <div className="mkt-cta-row">
              <button
                type="button"
                className="mkt-cta-primary"
                onClick={() => goToOpenApp('?section=bot', false)}
              >
                Start the trading bot
                <ArrowRight size={16} strokeWidth={2.5} />
              </button>
              <Link to="/pricing" className="mkt-cta-secondary">
                View pricing
              </Link>
              <Link to="/how-it-works" className="mkt-cta-secondary">
                How it works
              </Link>
            </div>

            <MarketingDisclaimer>
              This is not financial advice. Crypto and leveraged trading carry substantial risk of loss.
              Passive income automation does not guarantee profits.
            </MarketingDisclaimer>
          </div>
        </div>
      </main>

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default BotTradingPage;
