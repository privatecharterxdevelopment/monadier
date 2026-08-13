import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import OpenAppLink from '../layout/OpenAppLink';
import ProfileAvatar from '../profile/ProfileAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { displayHandle } from '../../lib/username';
import { goToOpenApp } from '../../lib/appUrls';
import { LANDING_NAV_LINKS } from '../../lib/landingNavLinks';

interface MobileMenuProps {
  onDownloadClick?: () => void;
  variant?: 'dark' | 'light';
  /** Slim home nav: help / leaderboard / how it works / launch — no product links */
  mode?: 'default' | 'minimal';
}

const MobileMenu: React.FC<MobileMenuProps> = ({ onDownloadClick, variant = 'dark', mode = 'default' }) => {
  const { t } = useTranslation();
  const light = variant === 'light';
  const minimal = mode === 'minimal';
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, profile, user, sessionReady } = useAuth();
  const displayName = displayHandle(profile, user?.email);
  const showName = sessionReady && isAuthenticated && user;

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const itemClass = (active = false) =>
    `landing-mobile-menu-link${active ? ' is-active' : ''}`;

  const panel = (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="landing-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label={t('common.toggleMenu')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={`landing-mobile-menu${light ? ' landing-mobile-menu--light' : ' landing-mobile-menu--dark'}`}
        >
          <div className="landing-mobile-menu-bar">
            <p className="landing-mobile-menu-title">Menu</p>
            <button
              type="button"
              className="landing-mobile-menu-close"
              aria-label={t('common.closeMenu')}
              onClick={() => setIsOpen(false)}
            >
              <X size={22} strokeWidth={2.25} />
            </button>
          </div>

          <nav className="landing-mobile-menu-nav">
            {minimal ? (
              <>
                <Link to="/faqs" onClick={() => setIsOpen(false)} className={itemClass(isActive('/faqs'))}>
                  {t('footer.faqs')}
                </Link>
                <Link
                  to="/leaderboard"
                  onClick={() => setIsOpen(false)}
                  className={itemClass(isActive('/leaderboard'))}
                >
                  {t('common.leaderboard')}
                </Link>
                <Link
                  to="/how-it-works"
                  onClick={() => setIsOpen(false)}
                  className={itemClass(isActive('/how-it-works'))}
                >
                  {t('common.howItWorks')}
                </Link>
                <Link to="/docs" onClick={() => setIsOpen(false)} className={itemClass(isActive('/docs'))}>
                  {t('footer.docs')}
                </Link>
                <Link to="/support" onClick={() => setIsOpen(false)} className={itemClass(isActive('/support'))}>
                  {t('common.helpCenter')}
                </Link>
              </>
            ) : (
              LANDING_NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsOpen(false)}
                  className={itemClass(isActive(link.to))}
                >
                  {t(link.labelKey)}
                </Link>
              ))
            )}

            {!minimal && onDownloadClick ? (
              <button
                type="button"
                onClick={() => {
                  onDownloadClick();
                  setIsOpen(false);
                }}
                className="landing-mobile-menu-link landing-mobile-menu-link--row"
              >
                <Download size={18} aria-hidden />
                {t('common.download')}
              </button>
            ) : null}
          </nav>

          <div className="landing-mobile-menu-footer">
            {!minimal ? (
              showName ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    goToOpenApp('', false);
                  }}
                  className="landing-mobile-menu-profile"
                >
                  <ProfileAvatar profile={profile} userId={user!.id} size="xs" className="landing-nav-profile-avatar" />
                  <span className="truncate">{displayName}</span>
                </button>
              ) : (
                <Link to="/login" onClick={() => setIsOpen(false)} className={itemClass()}>
                  {t('common.signIn')}
                </Link>
              )
            ) : null}
            <OpenAppLink onClick={() => setIsOpen(false)} className="landing-mobile-menu-cta">
              {t(minimal ? 'common.launchApp' : 'common.openApp')}
            </OpenAppLink>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className={minimal ? 'sm:hidden' : 'md:hidden'}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`landing-mobile-menu-trigger ${
          light ? 'landing-mobile-menu-trigger--light' : 'landing-mobile-menu-trigger--dark'
        }`}
        aria-label={t('common.toggleMenu')}
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={22} strokeWidth={2.25} /> : <Menu size={22} strokeWidth={2.25} />}
      </button>
      {typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </div>
  );
};

export default MobileMenu;
