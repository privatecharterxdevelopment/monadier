import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Clock,
  Shield,
  TrendingUp,
  Wallet,
  Zap,
  LineChart,
  Gauge,
  BarChart3,
  Fuel,
} from 'lucide-react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingPageCta,
  MarketingSectionHeading,
  MarketingCompactSteps,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import BotArchitectureSection from '../components/marketing/BotArchitectureSection';
import MarketingFaqAccordion from '../components/marketing/MarketingFaqAccordion';
import MarketingRelatedLinks from '../components/marketing/MarketingRelatedLinks';
import {
  TRADING_BOT_BENEFITS,
  TRADING_BOT_FAQS,
  TRADING_BOT_FEATURES,
} from '../lib/seo/tradingBotContent';
import {
  MktBotAiVisual,
  MktWalletVisual,
  MktDepositVisual,
  MktAgentApproveVisual,
  MktUptimeVisual,
  MktMtfStackVisual,
  MktControlPanelVisual,
} from '../components/marketing/MarketingIllustrations';

const BENEFIT_ICONS = [Clock, Zap, Shield, BarChart3, Wallet, Gauge] as const;
const FEATURE_ICONS = [LineChart, TrendingUp, Gauge, Shield, Bot, Fuel] as const;

const setupSteps = [
  {
    title: 'Connect your wallet',
    text: 'MetaMask or WalletConnect. Your keys stay with you — Monadier never holds your private keys.',
  },
  {
    title: 'Fund on Hyperliquid',
    text: 'Deposit native USDC on Arbitrum One to your HL account (min. $20 to run the bot).',
  },
  {
    title: 'Approve agent & start',
    text: 'One-time HL agent approval, set take profit, stop loss, and leverage, then press Start bot.',
  },
  {
    title: 'Full auto execution',
    text: 'The bot scans 200+ Hyperliquid perpetuals 24/7, opens the strongest setup, and manages exits.',
  },
];

const BotTradingPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Hyperliquid trading bot"
        title="Full auto Hyperliquid trading bot"
        lead="The Monadier trading bot executes automatically — 24/7, 365 days a year. You start it; it analyzes Hyperliquid perpetuals and manages positions while your USDC stays non-custodial on HL."
        sub="Built for passive income automation without giving up control. No subscription — full auto trading with live charts and bot controls in one terminal."
        aside={<MktBotAiVisual />}
      />

      <MarketingSectionHeading
        title="Why use this Hyperliquid bot"
        sub="Full auto trading, non-custodial funds, and 24/7 passive automation on Hyperliquid."
      />

      <MarketingPageGrid columns={3}>
        {TRADING_BOT_BENEFITS.map((item, i) => (
          <MarketingFeatureCard
            key={item.title}
            index={i}
            title={item.title}
            text={item.text}
            icon={BENEFIT_ICONS[i]}
          />
        ))}
      </MarketingPageGrid>

      <MarketingSectionHeading
        title="How the trading bot works"
        sub="Four steps from wallet connect to full auto Hyperliquid execution."
      />

      <MarketingCompactSteps steps={setupSteps} />

      <MarketingPageGrid columns={3}>
        {setupSteps.slice(0, 3).map((step, i) => (
          <MarketingFeatureCard
            key={`visual-${step.title}`}
            index={i}
            title={step.title}
            text={step.text}
            visual={
              i === 0 ? (
                <MktWalletVisual />
              ) : i === 1 ? (
                <MktDepositVisual />
              ) : (
                <MktAgentApproveVisual />
              )
            }
          />
        ))}
      </MarketingPageGrid>

      <MarketingSectionHeading
        title="Trading bot features"
        sub="What powers full auto execution on Hyperliquid perpetuals."
      />

      <MarketingPageGrid columns={3}>
        {TRADING_BOT_FEATURES.map((item, i) => (
          <MarketingFeatureCard
            key={item.title}
            title={item.title}
            text={item.text}
            icon={FEATURE_ICONS[i]}
          />
        ))}
      </MarketingPageGrid>

      <MarketingPageGrid columns={3} className="mkt-grid-follow">
        <MarketingFeatureCard
          title="24/7 market scanning"
          text="The bot scans 200+ Hyperliquid perpetuals around the clock — no manual chart watching."
          visual={<MktUptimeVisual />}
        />
        <MarketingFeatureCard
          title="Multi-market signals"
          text="Multi-timeframe analysis picks the strongest HL setup each cycle. Past results do not guarantee future performance."
          visual={<MktMtfStackVisual />}
        />
        <MarketingFeatureCard
          title="You stay in control"
          text="Stop the bot, close positions manually, or withdraw HL funds whenever you choose."
          visual={<MktControlPanelVisual />}
        />
      </MarketingPageGrid>

      <BotArchitectureSection />

      <MarketingSectionHeading
        title="Hyperliquid trading bot FAQ"
        sub="Common questions about full auto trading, fees, and non-custodial setup."
      />

      <MarketingFaqAccordion items={TRADING_BOT_FAQS} idPrefix="trading-bot-faq" />

      <MarketingRelatedLinks />

      <MarketingPageCta
        label="Start the trading bot"
        secondary={{ to: '/pricing', label: 'View pricing' }}
      />

      <MarketingDisclaimer>
        This is not financial advice. Crypto and leveraged trading carry substantial risk of loss.
        Passive income automation does not guarantee profits.
      </MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default BotTradingPage;
