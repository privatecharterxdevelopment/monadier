import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../ui/Logo';
import MobileMenu from '../ui/MobileMenu';
import OpenAppLink from '../layout/OpenAppLink';

const navLinks = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/trading-bot', label: 'Bot' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/about', label: 'About' },
];

type LandingNavProps = {
  variant?: 'dark' | 'light';
  /** GMX-style wide bar + Open app CTA */
  layout?: 'pill' | 'gmx';
};

const LandingNav: React.FC<LandingNavProps> = ({ variant = 'light', layout = 'pill' }) => {
  const light = variant === 'light';
  const gmx = layout === 'gmx';
  return (
    <header className={`fixed top-0 left-0 right-0 z-50 ${gmx ? 'pt-3 md:pt-5 px-3 sm:px-5 md:px-8' : 'pt-5 md:pt-6 px-4'}`}>
      <nav
        className={`mx-auto flex items-center justify-between gap-2 h-12 md:h-14 ${
          gmx
            ? 'landing-gmx-nav-bar max-w-[1200px] pl-3 pr-1.5 sm:pl-5 sm:pr-2 md:pl-6 md:pr-3 rounded-2xl glass-pill-light'
            : `max-w-4xl pl-4 pr-1.5 md:pl-5 md:pr-2 rounded-full ${light ? 'glass-pill-light' : 'glass-pill'}`
        }`}
      >
        <Logo size="sm" theme={light ? 'light' : 'dark'} />

        <div className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-[13px] font-medium tracking-normal transition-colors ${
                light
                  ? 'text-[#71717a] hover:text-[#0a0a0a]'
                  : 'text-zinc-500 hover:text-zinc-100'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          {gmx ? (
            <>
              <Link
                to="/login"
                className="hidden md:inline-flex px-3 py-1.5 text-[13px] font-medium text-[#71717a] hover:text-[#0a0a0a]"
              >
                Sign in
              </Link>
              <OpenAppLink className="inline-flex landing-gmx-nav-open md:inline-flex">
                <span className="md:hidden">App</span>
                <span className="hidden md:inline">Open app</span>
              </OpenAppLink>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className={`hidden md:inline-flex px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  light ? 'text-[#71717a] hover:text-[#0a0a0a]' : 'text-zinc-500 hover:text-primary'
                }`}
              >
                Sign in
              </Link>
              <OpenAppLink className="inline-flex md:inline-flex">
                <span
                  className={`inline-flex items-center px-3 md:px-4 py-1.5 md:py-2 rounded-full text-[12px] md:text-[13px] font-semibold transition-colors ${
                    light
                      ? 'text-[#0a0a0a] border border-[#c5c5cb] bg-white/50 hover:bg-white/80'
                      : 'bg-white text-[#08080a] hover:bg-zinc-100'
                  }`}
                >
                  <span className="md:hidden">App</span>
                  <span className="hidden md:inline">Open app</span>
                </span>
              </OpenAppLink>
            </>
          )}
          <div className={light ? 'md:hidden [&_button]:text-[#52525b]' : 'md:hidden [&_button]:text-zinc-400'}>
            <MobileMenu variant={variant} />
          </div>
        </div>
      </nav>
    </header>
  );
};

export default LandingNav;
