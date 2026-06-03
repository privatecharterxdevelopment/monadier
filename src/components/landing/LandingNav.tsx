import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../ui/Logo';
import MobileMenu from '../ui/MobileMenu';
import { useAuth } from '../../contexts/AuthContext';

const navLinks = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/trading-bot', label: 'Bot' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
];

type LandingNavProps = {
  variant?: 'dark' | 'light';
};

const LandingNav: React.FC<LandingNavProps> = ({ variant = 'light' }) => {
  const light = variant === 'light';
  const { isAuthenticated } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-5 md:pt-6 px-4">
      <nav
        className={`mx-auto flex items-center justify-between gap-2 max-w-4xl h-12 md:h-14 pl-4 pr-1.5 md:pl-5 md:pr-2 rounded-full ${
          light ? 'glass-pill-light' : 'glass-pill'
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

        <div className="flex items-center gap-1">
          {isAuthenticated ? (
            <Link to="/dashboard" className="hidden md:inline-flex">
              <span
                className={`inline-flex items-center px-4 py-2 rounded-full text-[13px] font-semibold transition-colors ${
                  light
                    ? 'text-[#0a0a0a] border border-[#c5c5cb] bg-white/50 hover:bg-white/80'
                    : 'bg-white text-[#08080a] hover:bg-zinc-100'
                }`}
              >
                Dashboard
              </span>
            </Link>
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
              <Link to="/register" className="hidden md:inline-flex">
                <span
                  className={`inline-flex items-center px-4 py-2 rounded-full text-[13px] font-semibold transition-colors ${
                    light
                      ? 'text-[#0a0a0a] border border-[#c5c5cb] bg-white/50 hover:bg-white/80'
                      : 'bg-white text-[#08080a] hover:bg-zinc-100'
                  }`}
                >
                  Get started
                </span>
              </Link>
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
