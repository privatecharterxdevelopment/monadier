import React from 'react';
import { Bell, ChevronDown, AlertTriangle, Wallet, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import Button from '../ui/Button';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';

const DashboardHeader: React.FC = () => {
  const { profile } = useAuth();
  const { kycStatus, verifyKYC } = useSubscription();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const needsVerification = kycStatus !== 'verified';

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleVerify = () => {
    verifyKYC();
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm py-6 border-b border-gray-800">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display text-2xl text-white">
            Welcome, {profile?.full_name || 'Member'}
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

        {needsVerification ? (
          <div className="flex items-center bg-yellow-500/10 px-4 py-2 rounded-full border border-yellow-500/20">
            <AlertTriangle size={18} className="text-yellow-400 mr-2" />
            <span className="text-sm text-yellow-400 mr-4">Account verification required</span>
            <Button variant="primary" size="sm" onClick={handleVerify}>
              Verify Now
            </Button>
          </div>
        ) : (
          <div className="flex items-center bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
            <CheckCircle size={18} className="text-green-400 mr-2" />
            <span className="text-sm text-green-400">Account Verified</span>
          </div>
        )}

        <div className="flex items-center space-x-4">
          {/* Connect Wallet Button */}
          <button
            onClick={() => open()}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              isConnected
                ? 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20'
            }`}
          >
            <Wallet size={18} />
            {isConnected && address ? formatAddress(address) : 'Connect Wallet'}
          </button>

          <button className="relative p-2 rounded-lg hover:bg-white/5 transition-colors">
            <Bell size={20} className="text-gray-500 hover:text-white transition-colors" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full"></span>
          </button>

          <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/5 px-3 py-2 rounded-lg transition-colors">
            <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white font-medium">
              {profile?.full_name?.charAt(0) || 'M'}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-white">{profile?.full_name || 'Monadier User'}</p>
              <p className="text-xs text-gray-500">
                {profile?.membership_tier === 'signature' ? 'Signature Member' : 'Essential Member'}
              </p>
            </div>
            <ChevronDown size={16} className="text-gray-500" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
