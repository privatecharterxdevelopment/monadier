import React from 'react';
import { ArrowRight, Shield, Trophy, Wallet, Zap } from 'lucide-react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingFeatureCard,
  MarketingPageGrid,
  MarketingSectionHeading,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import { goToOpenApp } from '../lib/appUrls';

const highlights = [
  {
    icon: Trophy,
    title: 'Verified sports markets',
    text: 'Browse live and upcoming sports events listed as Hyperliquid HIP-4 outcome markets — odds update on-chain as the book moves.',
  },
  {
    icon: Wallet,
    title: 'Non-custodial betting',
    text: 'Your USDC stays on your Hyperliquid account. Orders are wallet-signed; Monadier never holds your private keys.',
  },
  {
    icon: Zap,
    title: 'Fast on-chain execution',
    text: 'Place Yes/No bets directly on Hyperliquid outcome contracts. Open positions, cash out, and track P/L in the app.',
  },
  {
    icon: Shield,
    title: 'Transparent settlement',
    text: 'Markets resolve on verified outcomes. Positions and balances are visible on Hyperliquid — no opaque bookmaker ledger.',
  },
];

const steps = [
  {
    title: 'Connect & fund',
    text: 'Sign in with your wallet and deposit USDC to your Hyperliquid spot balance for outcome markets.',
  },
  {
    title: 'Pick a market',
    text: 'Open Sports in the app, browse leagues and events, and select Yes or No at live odds.',
  },
  {
    title: 'Track & cash out',
    text: 'Monitor open bets, sell early when liquidity is available, or hold until the market settles.',
  },
];

const SportsBettingPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Sports betting"
        title="Bet on verified sports on-chain"
        lead="Hyperliquid HIP-4 outcome markets inside Monadier — sports events with on-chain odds, wallet-signed orders, and transparent settlement."
        sub="Perps and sports in one HL account. Switch between automated trading and sports betting without leaving the app."
      />

      <MarketingPageGrid columns={2}>
        {highlights.map((item, i) => (
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
        title="How it works"
        sub="Three steps from wallet to your first on-chain sports bet."
      />

      <MarketingPageGrid columns={3} className="mkt-grid-follow">
        {steps.map((step, i) => (
          <MarketingFeatureCard key={step.title} index={i} title={step.title} text={step.text} />
        ))}
      </MarketingPageGrid>

      <div className="mkt-cta-row">
        <a
          href="/?section=sportsbets"
          className="mkt-cta-primary"
          onClick={(e) => {
            e.preventDefault();
            goToOpenApp('?section=sportsbets', false);
          }}
        >
          Open sports betting
          <ArrowRight size={16} strokeWidth={2.5} />
        </a>
      </div>

      <MarketingDisclaimer>
        Sports betting involves risk. Outcome markets can lose value; only bet what you can afford to lose.
        This is not financial advice.
      </MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default SportsBettingPage;
