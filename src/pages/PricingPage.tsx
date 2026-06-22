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
  MarketingPageCta,
  MarketingDisclaimer,
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
    title: 'Pay when you gain',
    text: 'A success fee applies only on profitable closes — 10% of profit. Losing trades have no success fee.',
    visual: <MktFeeVisual />,
  },
  {
    icon: Wallet,
    title: 'You keep most gains',
    text: 'On winning trades you keep the bulk of profit after the success fee and normal market costs.',
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
        lead="No platform fee — you mainly pay when the bot gains."
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

      <MarketingPageCta />

      <MarketingDisclaimer>
        This is not financial advice. Fees may change; see dashboard for live details.
      </MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default PricingPage;
