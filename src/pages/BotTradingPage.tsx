import React from 'react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingPageCta,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import BotArchitectureSection from '../components/marketing/BotArchitectureSection';

const steps = [
  {
    title: 'Connect your wallet',
    text: 'MetaMask or WalletConnect. Your keys stay with you — Monadier never holds your private keys.',
  },
  {
    title: 'Fund on Hyperliquid',
    text: 'Deposit USDC to your HL account from Monadier (Funds tab). Min $20 to run the bot.',
  },
  {
    title: 'Approve agent & start',
    text: 'One-time HL agent approval, then set risk, take profit, and stop loss. Press Start bot.',
  },
];

const highlights = [
  {
    title: '24/7 execution',
    text: 'The bot scans 200+ Hyperliquid perpetuals around the clock — no manual chart watching.',
  },
  {
    title: 'Multi-market signals',
    text: 'Multi-timeframe analysis picks the strongest HL setup each cycle. Past results do not guarantee future performance.',
  },
  {
    title: 'You stay in control',
    text: 'Stop the bot, close positions manually, or withdraw HL funds whenever you choose.',
  },
];

const BotTradingPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Trading bot"
        title="Automated Hyperliquid trading"
        lead="Executes automatically — 24/7, 365 days a year. You start it; it analyzes markets and manages positions."
        sub="Controlled by you and your wallet. No technical skills required to get going."
      />

      <MarketingPageGrid columns={3}>
        {steps.map((step, i) => (
          <MarketingFeatureCard key={step.title} index={i} title={step.title} text={step.text} />
        ))}
      </MarketingPageGrid>

      <MarketingPageGrid columns={3} className="mkt-grid-follow">
        {highlights.map((item) => (
          <MarketingFeatureCard key={item.title} title={item.title} text={item.text} />
        ))}
      </MarketingPageGrid>

      <BotArchitectureSection />

      <MarketingPageCta />

      <MarketingDisclaimer>This is not financial advice. Your capital is at risk.</MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default BotTradingPage;
