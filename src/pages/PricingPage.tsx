import React from 'react';
import {
  CircleOff,
  Fuel,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
} from '../components/marketing/MarketingInnerPage';
import PricingHeroGraphic from '../components/marketing/PricingHeroGraphic';
import {
  MktNoFeeVisual,
  MktGasCoveredVisual,
  MktFeeVisual,
  MktProfitShareVisual,
  MktHlFeesVisual,
  MktSlippageVisual,
} from '../components/marketing/MarketingIllustrations';

const steps: { title: string; text: string; icon: LucideIcon; visual?: React.ReactNode }[] = [
  {
    icon: CircleOff,
    title: 'No platform fee',
    text: 'No subscription, no hidden platform charge, and no fee just to run the bot.',
    visual: <MktNoFeeVisual />,
  },
  {
    icon: Fuel,
    title: 'Gas covered for you',
    text: 'Network gas on Arbitrum for bot trades is paid by Monadier — not billed to you per trade.',
    visual: <MktGasCoveredVisual />,
  },
  {
    icon: TrendingUp,
    title: 'No success fee',
    text: 'No Monadier cut on profitable closes. You only pay standard Hyperliquid trading and funding costs.',
    visual: <MktFeeVisual />,
  },
  {
    icon: Wallet,
    title: 'You keep your gains',
    text: 'Wins stay yours minus normal HL execution costs — no hidden platform take on profit.',
    visual: <MktProfitShareVisual />,
  },
  {
    icon: ArrowLeftRight,
    title: 'Hyperliquid execution costs',
    text: 'Standard HL open/close, funding, and execution fees apply per position — same as trading on Hyperliquid directly.',
    visual: <MktHlFeesVisual />,
  },
  {
    icon: Activity,
    title: 'Slippage & liquidity',
    text: 'Execution price can differ from the quote depending on size and liquidity. Major Arbitrum pairs usually see tighter spreads.',
    visual: <MktSlippageVisual />,
  },
];

const PricingPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Pricing"
        title="Transparent fees"
        lead="No platform fee — standard Hyperliquid costs only."
        sub="Full breakdowns and live numbers are in your dashboard before you trade."
        aside={<PricingHeroGraphic />}
      />

      <MarketingPageGrid columns={3}>
        {steps.map((step, i) => (
          <MarketingFeatureCard
            key={step.title}
            index={i}
            title={step.title}
            text={step.text}
            icon={step.icon}
            visual={step.visual}
          />
        ))}
      </MarketingPageGrid>
    </MarketingInnerPage>
  );
};

export default PricingPage;
