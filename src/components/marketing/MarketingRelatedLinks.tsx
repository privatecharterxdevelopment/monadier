import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const LINKS = [
  { to: '/pricing', label: 'Pricing & fees', text: 'No subscription — pay only on profitable closes.' },
  { to: '/technology', label: 'Bot technology', text: 'Signals, risk gates, and HL execution stack.' },
  { to: '/how-it-works', label: 'How it works', text: 'Wallet, USDC deposit, agent approval, start bot.' },
  { to: '/support', label: 'Support & FAQ', text: 'Help with deposits, settings, and withdrawals.' },
] as const;

/** Internal link hub on /trading-bot */
const MarketingRelatedLinks: React.FC = () => (
  <nav className="mkt-related-links" aria-label="Related pages">
    <h2 className="mkt-section-title">Learn more</h2>
    <ul className="mkt-related-links-list">
      {LINKS.map((link) => (
        <li key={link.to}>
          <Link to={link.to} className="mkt-related-link landing-glass-card">
            <span className="mkt-related-link-label">{link.label}</span>
            <span className="mkt-related-link-text">{link.text}</span>
            <ArrowRight size={16} className="mkt-related-link-icon" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  </nav>
);

export default MarketingRelatedLinks;
