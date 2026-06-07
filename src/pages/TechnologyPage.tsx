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

const engineFeatures = [
  {
    icon: Brain,
    title: 'Multi-timeframe analysis',
    text: 'The bot scans 1m through 1h charts on ETH, BTC, and ARB to align short-term entries with broader trend context.',
  },
  {
    icon: BarChart3,
    title: 'Quantitative signal stack',
    text: 'Momentum, mean-reversion, and volatility filters combined before any GMX perpetual entry is considered.',
  },
  {
    icon: Target,
    title: 'Confidence scoring',
    text: 'Each setup receives a confidence score. Trades execute only when thresholds and your bot settings align.',
  },
  {
    icon: Activity,
    title: 'Dynamic risk gates',
    text: 'Position sizing, leverage caps, and exposure limits respond to vault balance and open-trade state.',
  },
  {
    icon: LineChart,
    title: 'Trailing & exit logic',
    text: 'Take profit, stop loss, and trailing rules run automatically — you can also close manually from the terminal.',
  },
  {
    icon: Cpu,
    title: 'GMX execution on Arbitrum',
    text: 'Direct integration with GMX perpetuals for on-chain fills with oracle pricing and transparent settlement.',
  },
];

const pipeline = [
  {
    title: 'Market analysis',
    text: 'Continuous monitoring of price, volume, and multi-timeframe structure across supported GMX pairs.',
  },
  {
    title: 'Confidence scoring',
    text: 'Signals are ranked against historical patterns and your minimum win-rate / trade-count settings.',
  },
  {
    title: 'Position management',
    text: 'Entries include predefined TP/SL. The bot manages open positions until exit criteria are met.',
  },
  {
    title: 'Risk control',
    text: 'Configurable leverage and vault limits help cap drawdown while the bot runs 24/7 on our servers.',
  },
];

const TechnologyPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Technology"
        title="Quantitative engine for GMX perpetuals"
        lead="Institutional-style automation built for Arbitrum — analysis, risk gates, and execution in one system."
        sub="Non-custodial vault architecture. You control deposits, withdrawals, and when the bot runs."
      />

      <MarketingSectionHeading
        title="Trading engine"
        sub="Core components that power automated execution on GMX."
      />

      <MarketingPageGrid columns={3}>
        {engineFeatures.map((item, i) => (
          <MarketingFeatureCard
            key={item.title}
            index={i}
            title={item.title}
            text={item.text}
            icon={item.icon}
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
          />
        ))}
      </MarketingPageGrid>

      <MarketingSectionHeading title="Key parameters" />

      <div className="mkt-stats-row">
        <MarketingStatCard value="55–75%" label="Confidence range" />
        <MarketingStatCard value="0.6%" label="Trailing activation" />
        <MarketingStatCard value="100x" label="GMX max leverage" />
        <MarketingStatCard value="24/7" label="Market monitoring" />
      </div>

      <MarketingPageGrid columns={2} className="mkt-grid-follow">
        <MarketingFeatureCard
          icon={Shield}
          title="Non-custodial architecture"
          text="USDC sits in the audited V11 vault on Arbitrum. Only your wallet can deposit or withdraw — we never hold private keys."
        />
        <MarketingFeatureCard
          icon={TrendingUp}
          title="Transparent performance"
          text="Every open and closed trade is visible in the dashboard with realized and unrealized P/L. No hidden platform fees."
        />
      </MarketingPageGrid>

      <MarketingPageCta secondary={{ to: '/pricing', label: 'View pricing' }} />

      <MarketingDisclaimer>This is not financial advice. Your capital is at risk.</MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default TechnologyPage;
