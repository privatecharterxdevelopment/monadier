import React from 'react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingPageCta,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import { getAppUrl } from '../lib/appUrls';

const steps = [
  {
    title: 'Connect your wallet',
    text: 'MetaMask or WalletConnect. Your keys stay with you — Monadier never holds your private keys.',
  },
  {
    title: 'Fund your bot vault',
    text: 'Add USDC on Arbitrum. You choose the amount and can deposit or withdraw at any time.',
  },
  {
    title: 'Set risk & start',
    text: 'Pick your risk level, take profit, and stop loss. Leverage is optional — for experienced traders only.',
  },
];

const highlights = [
  {
    title: '24/7 execution',
    text: 'The bot monitors ETH, BTC, and ARB on GMX perpetuals around the clock — no manual chart watching.',
  },
  {
    title: '~70% win-rate target',
    text: 'Multi-timeframe analysis and risk gates before each entry. Past results do not guarantee future performance.',
  },
  {
    title: 'You stay in control',
    text: 'Stop the bot, close positions manually, or withdraw vault funds whenever you choose.',
  },
];

const BotTradingPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Trading bot"
        title="Automated GMX trading on Arbitrum"
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

      <MarketingPageCta href={getAppUrl('/register')} />

      <MarketingDisclaimer>This is not financial advice. Your capital is at risk.</MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default BotTradingPage;
