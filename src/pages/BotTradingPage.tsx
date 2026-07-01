import React, { useEffect } from 'react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import CookieConsent from '../components/ui/CookieConsent';
import MarketingPageBottomCta from '../components/marketing/MarketingPageBottomCta';
import BotTextHero from '../components/landing/BotTextHero';
import BotCapabilityCards from '../components/landing/BotCapabilityCards';
import BotAudienceVideoBanner from '../components/landing/BotAudienceVideoBanner';
import BotLandingFeatureBanners from '../components/landing/BotLandingFeatureBanners';
import BotFaqSection from '../components/landing/BotFaqSection';
import MarketingSeo from '../components/seo/MarketingSeo';
import { TRADING_BOT_FAQS } from '../lib/seo/tradingBotContent';

const BotTradingPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-gmx">
      <MarketingSeo path="/trading-bot" faqs={TRADING_BOT_FAQS} />
      <LandingNav variant="light" layout="gmx" />

      <BotTextHero />
      <BotCapabilityCards />
      <BotAudienceVideoBanner />
      <BotLandingFeatureBanners />
      <BotFaqSection />

      <MarketingPageBottomCta />

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default BotTradingPage;
