import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  LogOut,
  Bot,
  History,
  Package,
  Download
} from 'lucide-react';
import Logo from '../ui/Logo';
import { signOut } from '../../lib/supabase';

const SideNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const mainNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/dashboard/trading-bot', label: 'Trading Bot', icon: Bot },
    { path: '/dashboard/bot-history', label: 'Bot History', icon: History },
    { path: '/dashboard/downloads', label: 'Downloads', icon: Download },
    { path: '/dashboard/subscriptions', label: 'Subscriptions', icon: Package }
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
                    w-11 h-11 rounded-xl flex items-center justify-center
                    ${isActive ? 'bg-white/5' : 'hover:bg-surface-hover'}
                    transition-all duration-300
                  `}>
                    <IconComponent
                      size={20}
                      className={isActive ? 'text-accent' : 'text-gray-500 group-hover:text-gray-300'}
                    />
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
