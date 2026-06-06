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
    <footer className="landing-gmx-footer" role="contentinfo">
      <div className="landing-gmx-footer-inner">
        <nav className="landing-gmx-footer-links" aria-label="Site">
          {footerLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="landing-gmx-footer-disclaimer">
          Monadier is a fully decentralized, non-custodial trading interface. Deposits, withdrawals,
          and every trade the bot places on GMX are executed on Arbitrum and publicly verifiable on
          the blockchain. Vault trading lets you choose exactly how much USDC the bot may use — so
          you keep full transparency and control over your trading capital. Each transfer between
          your wallet and the vault requires your wallet signature; Monadier cannot move your funds
          without it. Nothing on this site constitutes financial advice.
        </p>
        <p className="landing-gmx-footer-meta">
          © {year} Monadier · Non-custodial GMX trading on Arbitrum · Email support only
        </p>
      </div>
    </footer>
  );
};

export default LandingFooter;
