import React from 'react';
import {
  Brain,
  TrendingUp,
  Shield,
  Target,
  Activity,
  BarChart3,
  Cpu,
  LineChart,
} from 'lucide-react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingSectionHeading,
  MarketingStatCard,
  MarketingPageCta,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import MarketingBotPromo from '../components/marketing/MarketingBotPromo';
import {
  MktBotAiVisual,
  MktMtfStackVisual,
  MktQuantStackVisual,
  MktConfidenceGaugeVisual,
  MktRiskGatesVisual,
  MktDynamicTrailVisual,
  MktHlExecVisual,
  MktRadarScanVisual,
  MktScoreRankVisual,
  MktPositionSlotsVisual,
  MktRiskDialVisual,
  MktWalletVisual,
  MktLedgerVisual,
} from '../components/marketing/MarketingIllustrations';

const engineFeatures = [
  {
    icon: Brain,
    title: 'Multi-timeframe analysis',
    text: 'The bot scans 1m through 1h charts across Hyperliquid markets to align short-term entries with broader trend context.',
    visual: <MktMtfStackVisual />,
  },
  {
    icon: BarChart3,
    title: 'Quantitative signal stack',
    text: 'Momentum, mean-reversion, and volatility filters combined before any Hyperliquid perp entry is considered.',
    visual: <MktQuantStackVisual />,
  },
  {
    icon: Target,
    title: 'Confidence scoring',
    text: 'Each setup receives a confidence score. Trades execute only when thresholds and your bot settings align.',
    visual: <MktConfidenceGaugeVisual />,
  },
  {
    icon: Activity,
    title: 'Dynamic risk gates',
    text: 'Position sizing, leverage caps, and exposure limits respond to HL balance and open-trade state.',
    visual: <MktRiskGatesVisual />,
  },
  {
    icon: LineChart,
    title: 'Dynamic trailing stop',
    text: 'ATR-based trailing lets winners run for hours while profits ratchet up automatically — exits only on price cross, not fixed USD floors.',
    visual: <MktDynamicTrailVisual />,
  },
  {
    icon: Cpu,
    title: 'Hyperliquid execution',
    text: 'Direct integration with Hyperliquid perpetuals for fast fills, deep liquidity, and transparent settlement.',
    visual: <MktHlExecVisual />,
  },
];

const pipeline = [
  {
    title: 'Market analysis',
    text: 'Continuous monitoring of price, volume, and multi-timeframe structure across 200+ HL perp markets.',
    visual: <MktRadarScanVisual />,
  },
  {
    title: 'Confidence scoring',
    text: 'Signals are ranked against historical patterns and your minimum win-rate / trade-count settings.',
    visual: <MktScoreRankVisual />,
  },
  {
    title: 'Position management',
    text: 'Dynamic trailing arms after fees are covered, then trails with ATR. Winners can run while profits stay secured until price crosses the stop.',
    visual: <MktPositionSlotsVisual />,
  },
  {
    title: 'Risk control',
    text: 'Configurable leverage and HL account limits help cap drawdown while the bot runs 24/7 on our servers.',
    visual: <MktRiskDialVisual />,
  },
];

const TechnologyPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Technology"
        title="Quantitative engine for Hyperliquid perpetuals"
        lead="Institutional-style automation built for HL — analysis, risk gates, and execution in one system."
        sub="Non-custodial: your USDC stays on your Hyperliquid account. You control deposits, withdrawals, and when the bot runs."
        aside={<MktBotAiVisual />}
      />

      <MarketingSectionHeading
        title="Trading engine"
        sub="Core components that power automated execution on Hyperliquid."
      />

      <MarketingPageGrid columns={3}>
        {engineFeatures.map((item, i) => (
          <MarketingFeatureCard
            key={item.title}
            index={i}
            title={item.title}
            text={item.text}
            icon={item.icon}
            visual={item.visual}
          />
        ))}
      </MarketingPageGrid>

      <MarketingSectionHeading
        title="Signal pipeline"
        sub="From scan to fill — how a trade moves through the system."
      />

      <MarketingPageGrid columns={2}>
        {pipeline.map((step, i) => (
          <MarketingFeatureCard
            key={step.title}
            index={i}
            title={step.title}
            text={step.text}
            visual={step.visual}
          />
        ))}
      </MarketingPageGrid>

      <MarketingSectionHeading title="Key parameters" />

      <div className="mkt-stats-row">
        <MarketingStatCard value="55–75%" label="Confidence range" />
        <MarketingStatCard value="5 min" label="Profit SL arms after" />
        <MarketingStatCard value="40x" label="HL max leverage (BTC)" />
        <MarketingStatCard value="24/7" label="Market monitoring" />
      </div>

      <MarketingPageGrid columns={2} className="mkt-grid-follow">
        <MarketingFeatureCard
          icon={Shield}
          title="Non-custodial architecture"
          text="USDC sits on your Hyperliquid account in your name. Only your wallet can deposit or withdraw — we never hold private keys."
          visual={<MktWalletVisual />}
        />
        <MarketingFeatureCard
          icon={TrendingUp}
          title="Transparent performance"
          text="Every open and closed trade is visible in the dashboard with realized and unrealized P/L."
          visual={<MktLedgerVisual />}
        />
      </MarketingPageGrid>

      <MarketingPageCta
        label="Open app"
        secondary={{ to: '/trading-bot', label: 'Hyperliquid trading bot' }}
      />

      <MarketingBotPromo kicker="Automated execution on Hyperliquid" />

      <MarketingDisclaimer>This is not financial advice. Your capital is at risk.</MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default TechnologyPage;
