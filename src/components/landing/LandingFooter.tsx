import React from 'react';
import { Link } from 'react-router-dom';
import LandingLegalDisclaimers from './LandingLegalDisclaimers';

const footerLinks = [
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

        <LandingLegalDisclaimers />

        <p className="landing-gmx-footer-meta">
          © {year} Monadier · Hyperliquid automated trading · support@monadier.com
        </p>
      </div>
    </footer>
  );
};

export default LandingFooter;
