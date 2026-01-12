import React, { useState, useRef, useEffect } from 'react';
import { Bell, ChevronDown, Wallet, X, TrendingUp, TrendingDown, Check, User, LogOut, Gift } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useNavigate } from 'react-router-dom';
import { signOut } from '../../lib/supabase';

const DashboardHeader: React.FC = () => {
  const { profile, user } = useAuth();
  const { planTier } = useSubscription();
  const navigate = useNavigate();

  // Get display name - prefer full_name, then email username, then fallback
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Member';
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
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
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Sign out error:', error);
      navigate('/', { replace: true });
    }
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm py-6 border-b border-gray-800">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display text-2xl text-white">
            Welcome, {displayName}
          </h1>
          <p className="text-gray-500 text-sm">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Connect Wallet Button - Compact */}
          <button
            onClick={() => open()}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all ${
              isConnected
                ? 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                : 'bg-white/5 text-accent border border-white/20 hover:bg-white/10'
            }`}
          >
            <Wallet size={14} />
            {isConnected && address ? formatAddress(address) : 'Connect'}
          </button>

          {/* Notification Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <Bell size={20} className="text-gray-500 hover:text-white transition-colors" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center text-xs text-white font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-card-dark border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="text-white font-medium">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={clearNotifications}
                        className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <Bell size={24} className="text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() => markAsRead(notification.id)}
                        className={`p-3 border-b border-gray-800/50 hover:bg-white/5 cursor-pointer transition-colors ${
                          !notification.read ? 'bg-white/[0.02]' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            notification.type === 'take_profit' ? 'bg-green-500/20' :
                            notification.type === 'stop_loss' ? 'bg-red-500/20' :
                            notification.type === 'trade_closed' ? 'bg-blue-500/20' :
                            notification.type === 'bonus' ? 'bg-amber-500/20' :
                            'bg-gray-500/20'
                          }`}>
                            {notification.type === 'take_profit' && <TrendingUp size={16} className="text-green-400" />}
                            {notification.type === 'stop_loss' && <TrendingDown size={16} className="text-red-400" />}
                            {notification.type === 'trade_closed' && <Check size={16} className="text-blue-400" />}
                            {notification.type === 'bonus' && <Gift size={16} className="text-amber-400" />}
                            {!['take_profit', 'stop_loss', 'trade_closed', 'bonus'].includes(notification.type) && (
                              <Bell size={16} className="text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-white text-sm font-medium truncate">{notification.title}</p>
                              {!notification.read && (
                                <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 ml-2"></span>
                              )}
                            </div>
                            <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{notification.message}</p>
                            {notification.data?.profit !== undefined && (
                              <p className={`text-xs font-medium mt-1 ${notification.data.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {notification.data.profit >= 0 ? '+' : ''}${notification.data.profit.toFixed(2)}
                              </p>
                            )}
                            <p className="text-gray-600 text-xs mt-1">{formatTimeAgo(notification.timestamp)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Menu Dropdown */}
          <div className="relative" ref={userMenuRef}>
            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/5 px-3 py-2 rounded-lg transition-colors"
            >
              <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white font-medium">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-white">{displayName}</p>
                <p className="text-xs text-gray-500">
                  {planTier === 'elite' || planTier === 'desktop' ? 'Elite Member' :
                   planTier === 'pro' ? 'Pro Member' :
                   planTier === 'starter' ? 'Starter Member' :
                   'Free Member'}
                </p>
              </div>
              <ChevronDown size={16} className={`text-gray-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </div>

            {/* User Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-card-dark border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50">
                <button
                  onClick={() => {
                    navigate('/dashboard/profile');
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <User size={18} />
                  <span>Profile</span>
                </button>
                <div className="border-t border-gray-800" />
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-300 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <LogOut size={18} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
