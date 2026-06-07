import React from 'react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingPageCta,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';

const steps = [
  {
    title: 'Connect your wallet',
    text: 'Sign in and link MetaMask or WalletConnect. Non-custodial — we never see your private keys.',
  },
  {
    title: 'Deposit to your vault',
    text: 'Add USDC to your on-chain bot vault on Arbitrum. You choose how much capital to use.',
  },
  {
    title: 'The bot runs for you',
    text: 'Our hedge-fund strategy executes on GMX automatically — 24/7, 365 days a year. It analyzes, enters, and manages positions.',
  },
  {
    title: 'Withdraw when you want',
    text: 'Profits stay in your vault balance until you withdraw USDC back to your wallet. You stay in control.',
  },
];

const HowItWorksPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Product"
        title="How it works"
        lead="A proven hedge-fund strategy, packaged as a bot. You set it up once — it handles the rest."
        sub="Set your risk. Optional leverage for experienced traders only."
      />

      <MarketingPageGrid columns={2}>
        {steps.map((step, i) => (
          <MarketingFeatureCard key={step.title} index={i} title={step.title} text={step.text} />
        ))}
      </MarketingPageGrid>

      <MarketingPageCta
        secondary={{ to: '/your-funds', label: 'How your funds are stored' }}
      />

      <MarketingDisclaimer>This is not financial advice. Your capital is at risk.</MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default HowItWorksPage;
