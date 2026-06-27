import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import CookieConsent from '../components/ui/CookieConsent';
import BotVideoHero from '../components/landing/BotVideoHero';
import BotEstimateSection from '../components/landing/BotEstimateSection';
import BotSetupStepsSection from '../components/landing/BotSetupStepsSection';
import BotBenefitsList from '../components/landing/BotBenefitsList';
import BotPipelineSection from '../components/landing/BotPipelineSection';
import BotFaqSection from '../components/landing/BotFaqSection';
import MarketingSeo from '../components/seo/MarketingSeo';
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
      <BotEstimateSection />
      <BotSetupStepsSection />
      <BotBenefitsList />
      <BotPipelineSection />
      <BotFaqSection />

      <section className="landing-gmx-gutter landing-bot-page-cta-section">
        <div className="landing-gmx-shell landing-bot-page-cta-shell">
          <div className="landing-bot-page-cta-row">
            <button
              type="button"
              className="landing-bot-page-cta-primary"
              onClick={() => goToOpenApp('?section=bot', false)}
            >
              Start the trading bot
              <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
            </button>
            <Link to="/pricing" className="landing-bot-page-cta-secondary">
              View pricing
            </Link>
            <Link to="/how-it-works" className="landing-bot-page-cta-secondary">
              How it works
            </Link>
          </div>
          <p className="landing-bot-page-disclaimer">
            This is not financial advice. Crypto and leveraged trading carry substantial risk of loss.
            Passive income automation does not guarantee profits.
          </p>
        </div>
      </section>

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default BotTradingPage;
