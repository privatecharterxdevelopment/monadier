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
    text: 'Network gas on Arbitrum for bot trades is paid by HyperGain — not billed to you per trade.',
    visual: <MktGasCoveredVisual />,
  },
  {
    icon: TrendingUp,
    title: 'Platform Success Fee',
    text: 'On qualifying profitable closes, a Platform Success Fee may accrue as disclosed in the Terms and in-app (currently up to 10% when enabled). Standard Hyperliquid trading and funding costs always apply.',
    visual: <MktFeeVisual />,
  },
  {
    icon: Wallet,
    title: 'You keep net gains',
    text: 'After Hyperliquid costs and any disclosed Platform Success Fee, remaining profit stays on your HL account — we never hold your keys.',
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
        lead="No monthly subscription — Hyperliquid costs plus fees as disclosed in Terms."
        sub="Full breakdowns and live numbers are in your dashboard before you trade. No promised returns."
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
