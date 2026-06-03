import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  Wallet,
  TrendingUp,
  TrendingDown,
  Check,
  User,
  LogOut,
  Gift,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { signOut } from '../../lib/supabase';

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Overview', subtitle: 'Vault, wallet & recent activity' },
  '/dashboard/chart-trades': { title: 'Chart trades', subtitle: 'Manual trading & live analysis' },
  '/dashboard/bot-trading': { title: 'Bot history', subtitle: 'Positions, P/L & approvals' },
  '/dashboard/subscriptions': { title: 'Plans', subtitle: 'Subscription & desktop license' },
  '/dashboard/downloads': { title: 'Downloads', subtitle: 'Desktop app & resources' },
  '/dashboard/profile': { title: 'Profile', subtitle: 'Account, wallets & security' },
  '/dashboard/monitor': { title: 'Admin', subtitle: 'Platform monitoring' },
};

function resolvePageMeta(pathname: string) {
  const exact = PAGE_META[pathname];
  if (exact) return exact;
  if (pathname.startsWith('/dashboard/monitor')) return PAGE_META['/dashboard/monitor'];
  return { title: 'Dashboard', subtitle: '' };
}

const DashboardTopBar: React.FC = () => {
  const { profile, user } = useAuth();
  const { planTier } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } =
    useNotifications();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Member';
  const pageMeta = resolvePageMeta(location.pathname);
  const isOverview = location.pathname === '/dashboard';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
    navigate('/', { replace: true });
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const planLabel =
    planTier === 'elite' || planTier === 'desktop'
      ? 'Elite'
      : planTier === 'pro'
        ? 'Pro'
        : planTier === 'starter'
          ? 'Starter'
          : 'Free';

  return (
    <header className="dashboard-topbar sticky top-0 z-30 mb-6">
      <div className="rounded-2xl border border-[#c5c5cb] bg-white/70 backdrop-blur-xl px-4 py-4 md:px-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#a1a1aa] mb-1">
              {pageMeta.title}
            </p>
            <h1 className="dashboard-welcome-heading font-display text-xl md:text-2xl font-semibold tracking-tight text-[#0a0a0a]">
              {isOverview ? `Welcome, ${displayName}` : pageMeta.title}
            </h1>
            <p className="text-sm text-[#52525b] mt-0.5 truncate">
              {isOverview
                ? new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                : pageMeta.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => open()}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs md:text-sm font-medium transition-colors ${
                isConnected
                  ? 'border-green-500/40 bg-green-500/10 text-green-700'
                  : 'border-[#c5c5cb] bg-white text-[#0a0a0a] hover:bg-black/[0.03]'
              }`}
            >
              <Wallet size={15} />
              <span className="hidden sm:inline">
                {isConnected && address ? formatAddress(address) : 'Connect wallet'}
              </span>
              <span className="sm:hidden">{isConnected ? 'Wallet' : 'Connect'}</span>
            </button>

            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 rounded-full border border-[#c5c5cb] bg-white text-[#52525b] hover:text-[#0a0a0a] hover:bg-black/[0.03] transition-colors"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center text-[10px] text-white font-semibold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-80 rounded-2xl border border-[#c5c5cb] bg-white/95 backdrop-blur-xl shadow-xl overflow-hidden z-50">
                  <div className="p-3 border-b border-[#c5c5cb] flex items-center justify-between">
                    <h3 className="text-[#0a0a0a] font-semibold text-sm">Notifications</h3>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllAsRead}
                          className="text-xs text-[#71717a] hover:text-[#0a0a0a]"
                        >
                          Mark all read
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          onClick={clearNotifications}
                          className="text-xs text-[#71717a] hover:text-red-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <Bell size={22} className="text-[#a1a1aa] mx-auto mb-2" />
                        <p className="text-sm text-[#52525b]">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((notification) => (
                        <div
                          key={notification.id}
                          onClick={() => markAsRead(notification.id)}
                          className={`p-3 border-b border-[#c5c5cb]/60 hover:bg-black/[0.02] cursor-pointer ${
                            !notification.read ? 'bg-black/[0.02]' : ''
                          }`}
                        >
                          <p className="text-sm font-medium text-[#0a0a0a] truncate">
                            {notification.title}
                          </p>
                          <p className="text-xs text-[#52525b] mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-[11px] text-[#a1a1aa] mt-1">
                            {formatTimeAgo(notification.timestamp)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 rounded-full border border-[#c5c5cb] bg-white pl-1 pr-2 py-1 hover:bg-black/[0.02] transition-colors"
              >
                <span className="w-8 h-8 rounded-full bg-[#0a0a0a] text-white text-sm font-semibold flex items-center justify-center">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden lg:block text-left">
                  <span className="block text-xs font-semibold text-[#0a0a0a] leading-tight max-w-[100px] truncate">
                    {displayName}
                  </span>
                  <span className="block text-[10px] text-[#71717a]">{planLabel} plan</span>
                </span>
                <ChevronDown
                  size={14}
                  className={`text-[#71717a] transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-[#c5c5cb] bg-white shadow-xl overflow-hidden z-50">
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/dashboard/profile');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-[#52525b] hover:bg-black/[0.03] hover:text-[#0a0a0a]"
                  >
                    <User size={18} />
                    Profile
                  </button>
                  <div className="border-t border-[#c5c5cb]" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-[#52525b] hover:bg-red-50 hover:text-red-600"
                  >
                    <LogOut size={18} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default DashboardTopBar;
