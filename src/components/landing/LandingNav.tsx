import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, CreditCard, Headphones } from 'lucide-react';
import Logo from '../ui/Logo';
import MobileMenu from '../ui/MobileMenu';
import OpenAppLink from '../layout/OpenAppLink';
import ProfileAvatar from '../profile/ProfileAvatar';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { useAuth } from '../../contexts/AuthContext';
import { displayHandle } from '../../lib/username';
import { goToOpenApp } from '../../lib/appUrls';
import { LANDING_NAV_LINKS } from '../../lib/landingNavLinks';
import OfficialXLink from './OfficialXLink';
import LandingThemeToggle from './LandingThemeToggle';
import { useLandingThemeOptional } from '../../contexts/LandingThemeContext';

type LandingNavProps = {
  /** Override; defaults to active landing theme */
  variant?: 'dark' | 'light';
  /** gmx = glass pill; minimal = slim home; alpha = AlphaLedger flat header inside frame */
  layout?: 'pill' | 'gmx' | 'minimal' | 'alpha';
};

const LandingNavAuth: React.FC<{ light: boolean }> = ({ light }) => {
  const { t } = useTranslation();
  const { isAuthenticated, profile, user, sessionReady } = useAuth();
  const displayName = displayHandle(profile, user?.email);
  const signedIn = sessionReady && isAuthenticated && user;

  const signInClass = `text-[13px] font-medium transition-colors ${
    light ? 'text-[#0a0a0a] hover:text-[#71717a]' : 'text-zinc-400 hover:text-zinc-100'
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

const LandingNav: React.FC<LandingNavProps> = ({ variant, layout = 'pill' }) => {
  const { t } = useTranslation();
  const theme = useLandingThemeOptional();
  const resolved = variant ?? theme ?? 'light';
  const light = resolved === 'light';
  const alpha = layout === 'alpha';
  const gmx = layout === 'gmx' || layout === 'minimal';
  const minimal = layout === 'minimal';
  const langVariant = light ? 'landing-light' : 'landing-dark';
  const linkClass = `text-[13px] font-medium tracking-normal transition-colors ${
    light ? 'text-[#0a0a0a] hover:text-[#71717a]' : 'text-zinc-400 hover:text-zinc-100'
  }`;

  if (alpha) {
    return (
      <header className="landing-al-header">
        <nav className="landing-al-nav" aria-label="Primary">
          <div className="landing-al-nav-left">
            <Logo size="md" variant="image" theme={light ? 'light' : 'dark'} className="landing-al-logo" />
          </div>

          <div className="landing-al-nav-center hidden sm:flex">
            <Link to="/faqs" className={`landing-al-nav-link ${linkClass}`}>
              {t('footer.faqs')}
            </Link>
            <Link to="/leaderboard" className={`landing-al-nav-link ${linkClass}`}>
              {t('common.leaderboard')}
            </Link>
            <Link to="/how-it-works" className={`landing-al-nav-link ${linkClass}`}>
              {t('common.howItWorks')}
            </Link>
            <Link to="/docs" className={`landing-al-nav-link landing-al-nav-link--docs ${linkClass}`}>
              {t('footer.docs')}
            </Link>
          </div>

          <div className="landing-al-nav-right">
            <Link
              to="/buy-crypto"
              className="landing-al-nav-support"
              aria-label={t('app.buyCrypto.navLabel')}
              title={t('app.buyCrypto.navLabel')}
            >
              <CreditCard size={18} strokeWidth={2.15} aria-hidden />
            </Link>
            <Link
              to="/support"
              className="landing-al-nav-support"
              aria-label={t('common.helpCenter')}
              title={t('common.helpCenter')}
            >
              <Headphones size={18} strokeWidth={2.15} aria-hidden />
            </Link>
            <LandingThemeToggle />
            <LanguageSwitcher variant={langVariant} className="landing-al-lang" />
            <OpenAppLink className="hidden sm:inline-flex landing-al-nav-cta">
              <span>{t('common.launchApp')}</span>
              <span className="landing-al-nav-cta-icon" aria-hidden>
                <ArrowUpRight size={12} strokeWidth={2.5} />
              </span>
            </OpenAppLink>
            <div className={light ? 'sm:hidden [&_button]:text-[#0a0a0a]' : 'sm:hidden [&_button]:text-zinc-400'}>
              <MobileMenu variant={resolved} mode="minimal" />
            </div>
          </div>
        </nav>
      </header>
    );
  }

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
            ? `landing-gmx-nav-bar max-w-[1200px] pl-3 pr-1.5 sm:pl-5 sm:pr-2 md:pl-6 md:pr-3 rounded-2xl ${
                light ? 'glass-pill-light' : 'glass-pill landing-gmx-nav-bar--dark'
              }`
            : `max-w-4xl pl-4 pr-1.5 md:pl-5 md:pr-2 rounded-full ${light ? 'glass-pill-light' : 'glass-pill'}`
        }`}
      >
        <Logo size="sm" variant="image" theme={light ? 'light' : 'dark'} />

        {!minimal ? (
          <div className="hidden md:flex items-center gap-7">
            {LANDING_NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className={linkClass}>
                {t(link.labelKey)}
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex-1" aria-hidden />
        )}

        <div className="flex items-center gap-1 md:gap-2">
          {minimal ? (
            <>
              <Link
                to="/support"
                className="landing-al-nav-support hidden sm:inline-flex"
                aria-label={t('common.helpCenter')}
                title={t('common.helpCenter')}
              >
                <Headphones size={18} strokeWidth={2.15} aria-hidden />
              </Link>
              <LandingThemeToggle />
              <Link to="/leaderboard" className={`hidden sm:inline-flex px-2 py-1.5 ${linkClass}`}>
                {t('common.leaderboard')}
              </Link>
              <OpenAppLink className="hidden sm:inline-flex landing-gmx-nav-open">
                {t('common.launchApp')}
              </OpenAppLink>
              <div className={light ? 'sm:hidden [&_button]:text-[#0a0a0a]' : 'sm:hidden [&_button]:text-zinc-400'}>
                <MobileMenu variant={resolved} mode="minimal" />
              </div>
            </>
          ) : (
            <>
              <Link
                to="/support"
                className="landing-al-nav-support"
                aria-label={t('common.helpCenter')}
                title={t('common.helpCenter')}
              >
                <Headphones size={18} strokeWidth={2.15} aria-hidden />
              </Link>
              <OfficialXLink className="landing-nav-x" />
              <LandingThemeToggle />
              <LanguageSwitcher variant={langVariant} />
              {layout === 'gmx' ? (
                <>
                  <LandingNavAuth light={light} />
                  <OpenAppLink className="hidden md:inline-flex landing-gmx-nav-open">
                    <span className="md:hidden">{t('common.app')}</span>
                    <span className="hidden md:inline">{t('common.openApp')}</span>
                  </OpenAppLink>
                </>
              ) : (
                <>
                  <LandingNavAuth light={light} />
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
                <MobileMenu variant={resolved} />
              </div>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};

export default LandingNav;
