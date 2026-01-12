import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  LogOut,
  Bot,
  LineChart,
  Package,
  Download,
  Activity,
  User,
  History,
  Shield
} from 'lucide-react';

const ADMIN_EMAIL = 'ipsunlorem@gmail.com';
import Logo from '../ui/Logo';
import { signOut, supabase } from '../../lib/supabase';
import { useWeb3 } from '../../contexts/Web3Context';

const SideNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { address } = useWeb3();
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAdmin(user?.email === ADMIN_EMAIL);
    };
    checkAdmin();
  }, []);

  // Subscribe to pending trade approvals
  useEffect(() => {
    if (!address) {
      setPendingApprovals(0);
      return;
    }

    const walletLower = address.toLowerCase();

    // Initial fetch
    const fetchPendingApprovals = async () => {
      const { count } = await supabase
        .from('pending_trade_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('wallet_address', walletLower)
        .eq('status', 'pending');
      setPendingApprovals(count || 0);
    };

    fetchPendingApprovals();

    // Realtime subscription
    const channel = supabase
      .channel('pending-approvals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_trade_approvals',
          filter: `wallet_address=eq.${walletLower}`
        },
        () => {
          fetchPendingApprovals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [address]);

  const mainNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/dashboard/chart-trades', label: 'Chart Trades', icon: LineChart },
    { path: '/dashboard/bot-trading', label: 'Bot Trading', icon: Bot },
    { path: '/dashboard/subscriptions', label: 'Subscriptions', icon: Package },
    { path: '/dashboard/profile', label: 'Profile', icon: User },
    // Admin only
    ...(isAdmin ? [{ path: '/dashboard/monitor', label: 'Admin', icon: Shield }] : [])
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Sign out error:', error);
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="h-screen fixed left-0 top-0 w-20 bg-card-dark border-r border-gray-800 flex flex-col items-center py-8">
      <Logo size="sm" iconOnly />

      <nav className="mt-16 flex-grow">
        <ul className="space-y-6">
          {mainNavItems.map((item) => {
            const isActive = currentPath === item.path ||
              (item.path !== '/dashboard' && currentPath.startsWith(item.path));
            const IconComponent = item.icon;

            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className="relative flex flex-col items-center justify-center group"
                >
                  <div className={`
                    w-11 h-11 rounded-xl flex items-center justify-center relative
                    ${isActive ? 'bg-white/5' : 'hover:bg-surface-hover'}
                    transition-all duration-300
                  `}>
                    <IconComponent
                      size={20}
                      className={isActive ? 'text-accent' : 'text-gray-500 group-hover:text-gray-300'}
                    />
                    {/* Pending approval badge for Bot Trading */}
                    {item.path === '/dashboard/bot-trading' && pendingApprovals > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                        {pendingApprovals}
                      </span>
                    )}
                  </div>

                  <span className={`text-[10px] mt-1 ${isActive ? 'text-accent' : 'text-gray-500'}`}>
                    {item.label}
                  </span>

                  {isActive && (
                    <motion.div
                      layoutId="active-nav-indicator"
                      className="absolute -left-[2px] w-1 h-8 bg-accent rounded-r-full"
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        onClick={handleSignOut}
        className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-surface-hover transition-colors group"
      >
        <LogOut size={20} className="text-gray-500 group-hover:text-red-400" />
      </button>
    </div>
  );
};

export default SideNavigation;
