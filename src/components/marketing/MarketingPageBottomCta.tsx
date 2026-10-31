import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';

export const MARKETING_PAGE_BOTTOM_DISCLAIMER =
  'This is not financial advice. Crypto and leveraged trading carry substantial risk of loss. Automation does not guarantee profits.';

const MarketingPageBottomCta: React.FC = () => (
  <section className="landing-gmx-gutter landing-bot-page-cta-section">
    <div className="landing-gmx-shell">
      <div className="landing-bot-page-cta-row">
        <button
          type="button"
          className="landing-bot-page-cta-primary"
          onClick={() => goToOpenApp('?section=bot', false)}
        >
          Start the trading bot
          <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
        </button>
        <Link to="/pricing" className="landing-bot-page-cta-secondary">
          View pricing
        </Link>
        <Link to="/how-it-works" className="landing-bot-page-cta-secondary">
          How it works
        </Link>
      </div>
      <p className="landing-bot-page-disclaimer">{MARKETING_PAGE_BOTTOM_DISCLAIMER}</p>
    </div>
  </section>
);

export default MarketingPageBottomCta;
