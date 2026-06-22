import React from 'react';
import { Link } from 'react-router-dom';

const footerLinks = [
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/support', label: 'Support' },
  { to: '/about', label: 'About' },
] as const;

const LandingFooter: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="landing-gmx-footer landing-gmx-gutter" role="contentinfo">
      <div className="landing-gmx-shell landing-gmx-footer-inner">
        <nav className="landing-gmx-footer-links" aria-label="Site">
          {footerLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="landing-gmx-footer-disclaimer">
          Monadier is a non-custodial trading interface for Hyperliquid. Your USDC stays on your HL
          account in your name. The trading agent can place perp orders but cannot withdraw without
          your wallet signature. Deposits and withdrawals are signed by you. Nothing on this site
          constitutes financial advice.
        </p>
        <p className="landing-gmx-footer-meta">
          © {year} Monadier · Hyperliquid automated trading · Email support only
        </p>
      </div>
    </footer>
  );
};

export default LandingFooter;
