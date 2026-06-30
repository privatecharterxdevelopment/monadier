import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../ui/Logo';
import MobileMenu from '../ui/MobileMenu';
import OpenAppLink from '../layout/OpenAppLink';
import ProfileAvatar from '../profile/ProfileAvatar';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { useAuth } from '../../contexts/AuthContext';
import { displayHandle } from '../../lib/username';
import { goToOpenApp } from '../../lib/appUrls';
import { LANDING_NAV_LINKS } from '../../lib/landingNavLinks';

type LandingNavProps = {
  variant?: 'dark' | 'light';
  /** GMX-style wide bar + Open app CTA */
  layout?: 'pill' | 'gmx';
};

const LandingNavAuth: React.FC<{ light: boolean; gmx: boolean }> = ({ light, gmx }) => {
  const { t } = useTranslation();
  const { isAuthenticated, profile, user, sessionReady } = useAuth();
  const displayName = displayHandle(profile, user?.email);
  const signedIn = sessionReady && isAuthenticated && user;

  const signInClass = gmx
    ? 'text-[13px] font-medium text-[#0a0a0a] hover:text-[#71717a]'
    : `text-[13px] font-medium transition-colors ${
        light ? 'text-[#0a0a0a] hover:text-[#71717a]' : 'text-zinc-500 hover:text-primary'
      }`;

  if (signedIn) {
    return (
      <button
        type="button"
        className="landing-nav-profile-btn"
        aria-label={t('common.openAppProfile', { name: displayName })}
        title={displayName}
        onClick={() => goToOpenApp('', false)}
      >
        <ProfileAvatar profile={profile} userId={user.id} size="xs" className="landing-nav-profile-avatar" />
      </button>
    );
  }

  return (
    <Link to="/login" className={`hidden md:inline-flex px-3 py-1.5 ${signInClass}`}>
      {t('common.signIn')}
    </Link>
  );
};

const LandingNav: React.FC<LandingNavProps> = ({ variant = 'light', layout = 'pill' }) => {
  const { t } = useTranslation();
  const light = variant === 'light';
  const gmx = layout === 'gmx';
  const langVariant = light ? 'landing-light' : 'landing-dark';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 ${
        gmx
          ? 'pt-[max(20px,env(safe-area-inset-top,0px))] md:pt-5 px-4 sm:px-5 md:px-8'
          : 'pt-5 md:pt-6 px-4'
      }`}
    >
      <nav
        className={`mx-auto flex items-center justify-between gap-2 h-12 md:h-14 ${
          gmx
            ? 'landing-gmx-nav-bar max-w-[1200px] pl-3 pr-1.5 sm:pl-5 sm:pr-2 md:pl-6 md:pr-3 rounded-2xl glass-pill-light'
            : `max-w-4xl pl-4 pr-1.5 md:pl-5 md:pr-2 rounded-full ${light ? 'glass-pill-light' : 'glass-pill'}`
        }`}
      >
        <Logo size="sm" theme={light ? 'light' : 'dark'} />

        <div className="hidden md:flex items-center gap-7">
          {LANDING_NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-[13px] font-medium tracking-normal transition-colors ${
                light
                  ? 'text-[#0a0a0a] hover:text-[#71717a]'
                  : 'text-zinc-500 hover:text-zinc-100'
              }`}
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          <LanguageSwitcher variant={langVariant} />
          {gmx ? (
            <>
              <LandingNavAuth light={light} gmx />
              <OpenAppLink className="hidden md:inline-flex landing-gmx-nav-open">
                <span className="md:hidden">{t('common.app')}</span>
                <span className="hidden md:inline">{t('common.openApp')}</span>
              </OpenAppLink>
            </>
          ) : (
            <>
              <LandingNavAuth light={light} gmx={false} />
              <OpenAppLink className="inline-flex md:inline-flex">
                <span
                  className={`inline-flex items-center px-3 md:px-4 py-1.5 md:py-2 rounded-full text-[12px] md:text-[13px] font-semibold transition-colors ${
                    light
                      ? 'text-[#0a0a0a] border border-[#c5c5cb] bg-white/50 hover:bg-white/80'
                      : 'bg-white text-[#08080a] hover:bg-zinc-100'
                  }`}
                >
                  <span className="md:hidden">{t('common.app')}</span>
                  <span className="hidden md:inline">{t('common.openApp')}</span>
                </span>
              </OpenAppLink>
            </>
          )}
          <div className={light ? 'md:hidden [&_button]:text-[#0a0a0a]' : 'md:hidden [&_button]:text-zinc-400'}>
            <MobileMenu variant={variant} />
          </div>
        </div>
      </nav>
    </header>
  );
};

export default LandingNav;
