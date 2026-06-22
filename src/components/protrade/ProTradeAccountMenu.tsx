import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  HelpCircle,
  History,
  LogOut,
  Settings,
  Shield,
  User,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { signOut } from '../../lib/supabase';
import { getMarketingUrl, LANDING_PATH } from '../../lib/appUrls';
import { useTermAuthToast } from '../terminal/TermAuthToast';
import ProfileAvatar from '../profile/ProfileAvatar';
import { displayHandle } from '../../lib/username';
import type { ProTradeProfileTab } from './proTradeProfileTypes';

type Props = {
  onOpenSupport?: () => void;
  onOpenProfile?: (tab?: ProTradeProfileTab) => void;
  onRequireSignIn?: (reason: string) => void;
};

const ProTradeAccountMenu: React.FC<Props> = ({
  onOpenSupport,
  onOpenProfile,
  onRequireSignIn,
}) => {
  const { profile, user } = useAuth();
  const { signOutWithToast } = useTermAuthToast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    if (!requireUser('Sign in to open profile and bot settings.')) return;
    onOpenProfile?.(tab);
  };

  const openSupport = () => {
    setOpen(false);
    if (!requireUser('Sign in to contact support.')) return;
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
        aria-label={user ? `Account menu, ${displayName}` : 'Sign in or register'}
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
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
          />
          <div className="hl-account-panel hl-account-panel--guest" role="menu" aria-label="Guest account menu">
            <div className="hl-account-guest-head">
              <strong>Your Monadier account</strong>
              <p>Sign in to save bot settings, profile, and trade history.</p>
            </div>
            <button
              type="button"
              className="hl-account-guest-primary"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRequireSignIn?.('Sign in to your Monadier account.');
              }}
            >
              Sign in
            </button>
            <a
              href="/register"
              className="hl-account-guest-secondary"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Create account
            </a>
          </div>
        </>
      ) : null}

      {user && open ? (
        <div className="hl-account-panel" role="menu" aria-label="Account menu">
          <div className="hl-account-panel-head">
            <ProfileAvatar profile={profile} userId={user.id} size="sm" />
            <div className="hl-account-panel-meta">
              <strong>{displayName}</strong>
              {username ? <span>@{username}</span> : null}
              <span className="hl-account-panel-email">{email || 'Profile & bot settings'}</span>
            </div>
          </div>

          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('identity')}
          >
            <Settings size={14} aria-hidden />
            Profile &amp; settings
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('security')}
          >
            <Shield size={14} aria-hidden />
            Security &amp; password
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('wallets')}
          >
            <Wallet size={14} aria-hidden />
            Linked wallets
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('history')}
          >
            <Clock size={14} aria-hidden />
            Login history
          </button>
          <button
            type="button"
            className="hl-account-item"
            role="menuitem"
            onClick={() => goProfile('botTrades')}
          >
            <History size={14} aria-hidden />
            Bot trade history
          </button>
          <button type="button" className="hl-account-item" role="menuitem" onClick={openSupport}>
            <HelpCircle size={14} aria-hidden />
            Support
          </button>

          <button
            type="button"
            className="hl-account-item hl-account-item--danger"
            role="menuitem"
            onClick={handleSignOut}
          >
            <LogOut size={14} aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ProTradeAccountMenu;
