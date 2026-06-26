import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import OpenAppLink from '../layout/OpenAppLink';
import ProfileAvatar from '../profile/ProfileAvatar';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { useAuth } from '../../contexts/AuthContext';
import { displayHandle } from '../../lib/username';
import { goToOpenApp } from '../../lib/appUrls';
import { LANDING_NAV_LINKS } from '../../lib/landingNavLinks';

interface MobileMenuProps {
  onDownloadClick?: () => void;
  variant?: 'dark' | 'light';
}

const MobileMenu: React.FC<MobileMenuProps> = ({ onDownloadClick, variant = 'dark' }) => {
  const { t } = useTranslation();
  const light = variant === 'light';
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, profile, user, sessionReady } = useAuth();
  const displayName = displayHandle(profile, user?.email);
  const showName = sessionReady && isAuthenticated && user;

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="md:hidden relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 transition-colors ${
          light ? 'text-[#71717a] hover:text-[#0a0a0a]' : 'text-secondary hover:text-primary'
        }`}
        aria-label={t('common.toggleMenu')}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className={`absolute top-full right-0 mt-2 min-w-[200px] rounded-xl z-50 overflow-hidden shadow-lg ${
              light
                ? 'bg-white border border-[#e4e4e7] shadow-black/10'
                : 'bg-[#0a0a0a] border border-white/10 shadow-black/40'
            }`}
          >
            <nav className="py-2 px-1">
              <div className="flex flex-col">
                {LANDING_NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setIsOpen(false)}
                    className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                      light
                        ? isActive(link.to)
                          ? 'text-[#0a0a0a] bg-[#f4f4f5]'
                          : 'text-[#52525b] hover:text-[#0a0a0a] hover:bg-[#f4f4f5]'
                        : isActive(link.to)
                          ? 'text-white bg-white/10'
                          : 'text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {t(link.labelKey)}
                  </Link>
                ))}

                {onDownloadClick && (
                  <button
                    onClick={() => {
                      onDownloadClick();
                      setIsOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                      light
                        ? 'text-[#52525b] hover:text-[#0a0a0a] hover:bg-[#f4f4f5]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Download size={16} />
                    {t('common.download')}
                  </button>
                )}

                <div className={`px-3 py-2 ${light ? '' : ''}`}>
                  <LanguageSwitcher variant={light ? 'landing-light' : 'landing-dark'} />
                </div>

                <div
                  className={`mt-1 pt-1 border-t flex flex-col gap-0.5 ${
                    light ? 'border-[#ececef]' : 'border-white/10'
                  }`}
                >
                  {showName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        goToOpenApp('', false);
                      }}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors w-full text-left ${
                        light
                          ? 'text-[#0a0a0a] hover:bg-[#f4f4f5]'
                          : 'text-white hover:bg-white/10'
                      }`}
                    >
                      <ProfileAvatar profile={profile} userId={user!.id} size="xs" className="landing-nav-profile-avatar" />
                      <span className="truncate">{displayName}</span>
                    </button>
                  ) : (
                    <Link
                      to="/login"
                      onClick={() => setIsOpen(false)}
                      className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                        light
                          ? 'text-[#52525b] hover:text-[#0a0a0a] hover:bg-[#f4f4f5]'
                          : 'text-zinc-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {t('common.signIn')}
                    </Link>
                  )}
                  <OpenAppLink
                    onClick={() => setIsOpen(false)}
                    className="mx-1 mb-1 px-3 py-2 bg-[#0a0a0a] text-white rounded-lg text-[13px] font-medium text-center hover:bg-[#27272a] transition-colors"
                  >
                    {t('common.openApp')}
                  </OpenAppLink>
                </div>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobileMenu;
