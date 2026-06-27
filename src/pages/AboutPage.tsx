import React from 'react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import CookieConsent from '../components/ui/CookieConsent';
import MarketingSeo from '../components/seo/MarketingSeo';
import {
  MarketingPageHero,
  MarketingDisclaimer,
} from '../components/marketing/MarketingInnerPage';
import MarketingBotPromo from '../components/marketing/MarketingBotPromo';
import { MktTeamVisual } from '../components/marketing/MarketingIllustrations';

const AboutPage: React.FC = () => {
  return (
    <div className="landing-gmx min-h-[100dvh] min-h-[100svh]">
      <MarketingSeo path="/about" />
      <LandingNav variant="light" layout="gmx" />

      <main className="landing-gmx-page-main landing-gmx-page-main--inner landing-gmx-gutter">
        <div className="landing-gmx-shell">
          <div className="mkt-page">
            <MarketingPageHero
              eyebrow="Company"
              title="About Monadier"
              lead="Six IT engineers from Switzerland — ETH Zurich alumni — who turned a hedge-fund strategy into a fully automated trading bot."
              sub="We built Monadier to make institutional-style execution accessible through a simple Hyperliquid dashboard."
              aside={<MktTeamVisual />}
            />

            <div className="mkt-prose-grid">
              <div className="mkt-prose-block landing-glass-card">
                <p>
                  There is no glossy &ldquo;about us&rdquo; story — we are builders who packaged a proven
                  quantitative approach into self-developed software. The bot analyzes markets, enters Hyperliquid
                  perpetuals, and targets roughly a 70% win rate while you control risk and capital.
                </p>
              </div>
              <div className="mkt-prose-block landing-glass-card">
                <p>
                  Monadier is non-custodial: your wallet signs deposits and withdrawals. You start the bot,
                  set take profit and stop loss, and optionally leverage — leverage is for experienced
                  traders only. No PhD required to get started.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <section
        className="landing-gmx-section landing-gmx-gutter mkt-about-philosophy-section"
        aria-labelledby="mkt-about-philosophy-title"
      >
        <div className="landing-gmx-shell mkt-about-philosophy-inner">
          <h2 id="mkt-about-philosophy-title" className="mkt-about-philosophy-title">
            Philosophy
          </h2>
          <p className="mkt-about-philosophy-text">
            Connect your wallet, fund your HL account, and let the terminal run. You are the
            administrator — we provide the infrastructure and automation. Crypto trading carries
            substantial risk; only use capital you can afford to lose.
          </p>
        </div>
      </section>

      <main className="landing-gmx-page-main landing-gmx-page-main--inner landing-gmx-gutter">
        <div className="landing-gmx-shell">
          <div className="mkt-page">
            <MarketingBotPromo kicker="Our core product" />
            <MarketingDisclaimer>This is not financial advice.</MarketingDisclaimer>
          </div>
        </div>
      </main>

      <LandingFooter />
      <CookieConsent />
    </div>
  );
};

export default AboutPage;
