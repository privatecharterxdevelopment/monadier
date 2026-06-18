import React from 'react';
import MarketingInnerPage, {
  MarketingPageHero,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';

const AboutPage: React.FC = () => {
  return (
    <MarketingInnerPage>
      <MarketingPageHero
        eyebrow="Company"
        title="About Monadier"
        lead="Six IT engineers from Switzerland — ETH Zurich alumni — who turned a hedge-fund strategy into a fully automated trading bot."
        sub="We built Monadier to make institutional-style execution accessible through a simple Hyperliquid dashboard."
      />

      <div className="mkt-prose-grid">
        <div className="mkt-prose-block">
          <p>
            There is no glossy &ldquo;about us&rdquo; story — we are builders who packaged a proven
            quantitative approach into self-developed software. The bot analyzes markets, enters Hyperliquid
            perpetuals, and targets roughly a 70% win rate while you control risk and capital.
          </p>
        </div>
        <div className="mkt-prose-block">
          <p>
            Monadier is non-custodial: your wallet signs deposits and withdrawals. You start the bot,
            set take profit and stop loss, and optionally leverage — leverage is for experienced
            traders only. No PhD required to get started.
          </p>
        </div>
        <div className="mkt-prose-block mkt-prose-block--wide">
          <p>
            Connect your wallet, fund your HL account, and let the terminal run. You are the
            administrator — we provide the infrastructure and automation. Crypto trading carries
            substantial risk; only use capital you can afford to lose.
          </p>
        </div>
      </div>

      <MarketingDisclaimer>This is not financial advice.</MarketingDisclaimer>
    </MarketingInnerPage>
  );
};

export default AboutPage;
