import React from 'react';
import LandingPageShell from '../components/landing/LandingPageShell';
import CookieConsent from '../components/ui/CookieConsent';
import MarketingPageBottomCta from '../components/marketing/MarketingPageBottomCta';
import BotTextHero from '../components/landing/BotTextHero';
import BotCapabilityCards from '../components/landing/BotCapabilityCards';
import BotAudienceVideoBanner from '../components/landing/BotAudienceVideoBanner';
import BotLandingFeatureBanners from '../components/landing/BotLandingFeatureBanners';
import MarketingSeo from '../components/seo/MarketingSeo';
import { TRADING_BOT_FAQS } from '../lib/seo/tradingBotContent';
import { useLandingTheme } from '../contexts/LandingThemeContext';

const BotTradingPage: React.FC = () => {
  const { theme } = useLandingTheme();

  return (
    <div className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${theme}`}>
      <MarketingSeo path="/trading-bot" faqs={TRADING_BOT_FAQS} />
      <LandingPageShell afterContent={<MarketingPageBottomCta />}>
        <BotTextHero />
        <BotCapabilityCards />
        <BotAudienceVideoBanner />
        <BotLandingFeatureBanners />
      </LandingPageShell>
      <CookieConsent />
    </div>
  );
};

export default BotTradingPage;
