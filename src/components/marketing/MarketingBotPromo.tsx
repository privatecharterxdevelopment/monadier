import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot } from 'lucide-react';

type Props = {
  /** Short line above the link */
  kicker?: string;
  className?: string;
};

/** Internal SEO link block → /trading-bot */
const MarketingBotPromo: React.FC<Props> = ({
  kicker = 'Full auto Hyperliquid trading',
  className = '',
}) => (
  <aside className={`mkt-bot-promo landing-glass-card ${className}`.trim()}>
    <div className="mkt-bot-promo-icon" aria-hidden>
      <Bot size={22} strokeWidth={1.75} />
    </div>
    <div className="mkt-bot-promo-copy">
      <p className="mkt-bot-promo-kicker">{kicker}</p>
      <h2 className="mkt-bot-promo-title">Hyperliquid Trading Bot</h2>
      <p className="mkt-bot-promo-text">
        Full auto 24/7 execution across 200+ perpetual markets — non-custodial, no subscription,
        full-auto Hyperliquid automation — non-custodial, no guaranteed returns.
      </p>
      <Link to="/trading-bot" className="mkt-bot-promo-link">
        Explore the trading bot
        <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
      </Link>
    </div>
  </aside>
);

export default MarketingBotPromo;
