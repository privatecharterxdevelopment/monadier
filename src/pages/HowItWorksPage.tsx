import React from 'react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingPageCta,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import {
  MktWalletVisual,
  MktDepositVisual,
  MktBotScanVisual,
  MktWithdrawVisual,
} from '../components/marketing/MarketingIllustrations';

const steps = [
  {
    title: 'Connect your wallet',
    text: 'Sign in and link MetaMask or WalletConnect. Non-custodial — we never see your private keys.',
    visual: <MktWalletVisual />,
  },
  {
    title: 'Deposit on Hyperliquid',
    text: 'Add USDC to your HL account from Monadier (Funds tab). You choose how much capital to use.',
    visual: <MktDepositVisual />,
  },
  {
    title: 'The bot runs for you',
    text: 'Our strategy executes on Hyperliquid automatically — 24/7, 365 days a year. It scans all HL perps, enters, and manages positions.',
    visual: <MktBotScanVisual />,
  },
  {
    title: 'Withdraw when you want',
    text: 'Profits stay on your HL account until you withdraw USDC back to your wallet. You stay in control.',
    visual: <MktWithdrawVisual />,
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
        aside={<MktBotScanVisual />}
      />

      <MarketingPageGrid columns={2}>
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

      <MarketingPageCta
        secondary={{ to: '/your-funds', label: 'How your funds are stored' }}
      />

      <MarketingDisclaimer>This is not financial advice. Your capital is at risk.</MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default HowItWorksPage;
