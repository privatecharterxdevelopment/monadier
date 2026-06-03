import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  Bot,
  LineChart,
  Package,
  Download,
  User,
  History,
  Shield,
} from 'lucide-react';
import Logo from '../ui/Logo';
import { signOut, supabase } from '../../lib/supabase';
import { isAdminEmail } from '../../lib/admin';
import { useWeb3 } from '../../contexts/Web3Context';

type NavItem = {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  mobileLabel?: string;
};

const DashboardSidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { address } = useWeb3();
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAdmin(isAdminEmail(user?.email));
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    if (!address) {
      setPendingApprovals(0);
      return;
    }

    const walletLower = address.toLowerCase();

    const fetchPendingApprovals = async () => {
      const { count } = await supabase
        .from('pending_trade_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('wallet_address', walletLower)
        .eq('status', 'pending');
      setPendingApprovals(count || 0);
    };

    fetchPendingApprovals();

    const channel = supabase
      .channel('pending-approvals-sidebar')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_trade_approvals',
          filter: `wallet_address=eq.${walletLower}`,
        },
        () => fetchPendingApprovals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [address]);

  const navItems: NavItem[] = [
    { path: '/dashboard2', label: 'Dashboard', icon: LayoutDashboard, mobileLabel: 'Home' },
    { path: '/dashboard/bot-trading', label: 'Bot trading', icon: Bot, mobileLabel: 'Bot' },
    { path: '/dashboard/chart-trades', label: 'Chart & trade', icon: LineChart, mobileLabel: 'Chart' },
    { path: '/dashboard/subscriptions', label: 'Plans', icon: Package, mobileLabel: 'Plans' },
    { path: '/dashboard/downloads', label: 'Downloads', icon: Download, mobileLabel: 'Apps' },
    { path: '/dashboard/profile', label: 'Profile', icon: User, mobileLabel: 'Profile' },
    ...(isAdmin ? [{ path: '/dashboard/monitor', label: 'Admin', icon: Shield, mobileLabel: 'Admin' }] : []),
  ];

  const isActive = (path: string) =>
    currentPath === path ||
    (path === '/dashboard2' && currentPath === '/dashboard') ||
    (path !== '/dashboard2' && currentPath.startsWith(path));

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
    navigate('/', { replace: true });
  };

  const NavLinkItem = ({ item, compact }: { item: NavItem; compact?: boolean }) => {
    const active = isActive(item.path);
    const Icon = item.icon;
    const showBadge = item.path === '/dashboard/bot-trading' && pendingApprovals > 0;

    return (
      <Link
        to={item.path}
        className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
          active
            ? 'bg-white/90 text-[#0a0a0a] shadow-sm border border-[#c5c5cb]'
            : 'text-[#52525b] hover:text-[#0a0a0a] hover:bg-white/50 border border-transparent'
        } ${compact ? 'flex-col gap-1 py-2 px-1' : ''}`}
      >
        <span className="relative shrink-0">
          <Icon size={compact ? 20 : 18} strokeWidth={2} />
          {showBadge && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {pendingApprovals > 9 ? '9+' : pendingApprovals}
            </span>
          )}
        </span>
        <span className={compact ? 'text-[10px]' : 'truncate'}>{compact ? item.mobileLabel || item.label : item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="dashboard-sidebar hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-40 md:border-r md:border-[#c5c5cb] md:bg-white/55 md:backdrop-blur-xl">
        <div className="flex h-full flex-col px-4 py-6">
          <div className="mb-8 px-1">
            <Logo size="sm" theme="light" />
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLinkItem key={item.path} item={item} />
            ))}
          </nav>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#52525b] transition-colors hover:bg-red-50 hover:text-red-600 border border-transparent"
          >
            <LogOut size={18} strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="dashboard-sidebar-mobile md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[#c5c5cb] bg-white/80 backdrop-blur-xl safe-area-bottom">
        <div className="flex items-stretch h-[4.25rem] px-0.5 overflow-x-auto scrollbar-none">
          {navItems.map((item) => (
            <div key={item.path} className="flex-1 min-w-[4.25rem] max-w-[5.5rem]">
              <NavLinkItem item={item} compact />
            </div>
          ))}
        </div>
      </nav>
    </>
  );
};

export default DashboardSidebar;
