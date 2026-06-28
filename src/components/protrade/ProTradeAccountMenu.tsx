import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  Gift,
  HelpCircle,
  History,
  LogOut,
  Settings,
  Shield,
  User,
  Wallet,
  LayoutDashboard,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../lib/supabase';
import { getMarketingUrl, LANDING_PATH, getAdminDashboardPath } from '../../lib/appUrls';
import { isAdminEmail } from '../../lib/admin';
import { useTermAuthToast } from '../terminal/TermAuthToast';
import ProfileAvatar from '../profile/ProfileAvatar';
import { displayHandle } from '../../lib/username';
import type { ProTradeProfileTab } from './proTradeProfileTypes';

type Props = {
  onOpenSupport?: () => void;
  onOpenProfile?: (tab?: ProTradeProfileTab) => void;
  onOpenAffiliate?: () => void;
  onRequireSignIn?: (reason: string) => void;
};

const ProTradeAccountMenu: React.FC<Props> = ({
  onOpenSupport,
  onOpenProfile,
  onOpenAffiliate,
  onRequireSignIn,
}) => {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const { signOutWithToast } = useTermAuthToast();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsAdmin(isAdminEmail(user?.email));
  }, [user?.email]);

  const displayName = displayHandle(profile, user?.email);
  const username = profile?.username?.trim();
  const email = profile?.email || user?.email;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onCloseOverlays = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('monadier:close-overlays', onCloseOverlays);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('monadier:close-overlays', onCloseOverlays);
    };
  }, [open]);

  const requireUser = (reason: string): boolean => {
    if (user) return true;
    onRequireSignIn?.(reason);
    return false;
  };

  const goProfile = (tab: ProTradeProfileTab = 'identity') => {
    setOpen(false);
    if (!requireUser(t('auth.signInToProfile'))) return;
    onOpenProfile?.(tab);
  };

  const openAffiliate = () => {
    setOpen(false);
    if (!requireUser(t('auth.signInToAffiliate'))) return;
    onOpenAffiliate?.();
  };

  const openSupport = () => {
    setOpen(false);
    if (!requireUser(t('auth.signInToSupport'))) return;
    onOpenSupport?.();
  };

  const handleTriggerClick = () => {
    setOpen((v) => !v);
  };

  const handleSignOut = () => {
    setOpen(false);
    void signOutWithToast(signOut, () => {
      const home = getMarketingUrl(LANDING_PATH);
      window.location.href = home.startsWith('http') ? home : LANDING_PATH;
    });
  };

  return (
    <div className="hl-account-menu" ref={rootRef}>
      <button
        type="button"
        className={`hl-topnav-icon-btn hl-account-menu-trigger ${user ? 'hl-account-menu-trigger--signed-in' : ''}`}
        aria-label={user ? `${t('app.account.accountMenu')}, ${displayName}` : t('auth.signInOrRegister')}
        aria-expanded={user ? open : undefined}
        onClick={handleTriggerClick}
      >
        {user ? (
          <ProfileAvatar profile={profile} userId={user.id} size="xs" className="hl-account-avatar" />
        ) : (
          <User size={16} aria-hidden />
        )}
      </button>

      {!user && open ? (
        <>
          <button
            type="button"
            className="hl-account-sheet-backdrop"
            aria-label={t('app.account.closeAccountMenu')}
            onClick={() => setOpen(false)}
          />
          <div className="hl-account-panel hl-account-panel--guest" role="menu" aria-label={t('app.account.guestAccountMenu')}>
            <div className="hl-account-guest-head">
              <strong>{t('app.account.title')}</strong>
              <p>{t('app.account.guestDesc')}</p>
            </div>
            <button
              type="button"
              className="hl-account-guest-primary"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRequireSignIn?.(t('auth.signInToAccount'));
              }}
            >
              {t('common.signIn')}
            </button>
            <a
              href="/register"
              className="hl-account-guest-secondary"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {t('common.createAccount')}
            </a>
          </div>
        </>
      ) : null}

      {user && open ? (
        <div className="hl-account-panel" role="menu" aria-label={t('app.account.accountMenu')}>
          <div className="hl-account-panel-head">
            <ProfileAvatar profile={profile} userId={user.id} size="sm" />
            <div className="hl-account-panel-meta">
              <strong>{displayName}</strong>
              {username ? <span>@{username}</span> : null}
              <span className="hl-account-panel-email">{email || t('app.account.profileSettingsFallback')}</span>
            </div>
          </div>

          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('identity')}
          >
            <Settings size={14} aria-hidden />
            {t('app.account.profileSettings')}
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={openAffiliate}
          >
            <Gift size={14} aria-hidden />
            {t('app.account.affiliateProgram')}
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('security')}
          >
            <Shield size={14} aria-hidden />
            {t('app.account.securityPassword')}
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('wallets')}
          >
            <Wallet size={14} aria-hidden />
            {t('app.account.linkedWallets')}
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('history')}
          >
            <Clock size={14} aria-hidden />
            {t('app.account.loginHistory')}
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('botTrades')}
          >
            <History size={14} aria-hidden />
            {t('app.account.botTradeHistory')}
          </button>
          <button type="button" className="hl-account-item" role="menuitem" onClick={openSupport}>
            <HelpCircle size={14} aria-hidden />
            {t('common.support')}
          </button>
          {isAdmin ? (
            <a
              href={getAdminDashboardPath()}
              className="hl-account-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <LayoutDashboard size={14} aria-hidden />
              Admin dashboard
            </a>
          ) : null}

          <button
            type="button"
            className="hl-account-item hl-account-item--danger"
            role="menuitem"
            onClick={handleSignOut}
          >
            <LogOut size={14} aria-hidden />
            {t('common.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ProTradeAccountMenu;
