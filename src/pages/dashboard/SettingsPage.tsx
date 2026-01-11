import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Wallet, Save, CheckCircle, AlertCircle, Loader2, Crown, Shield } from 'lucide-react';
import Card from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { supabase } from '../../lib/supabase';

const SettingsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { subscription } = useSubscription();

  const [walletAddress, setWalletAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load existing wallet address
  useEffect(() => {
    if (profile?.wallet_address) {
      setWalletAddress(profile.wallet_address);
    } else if (subscription?.wallet_address) {
      setWalletAddress(subscription.wallet_address);
    }
  }, [profile, subscription]);

  const isValidAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const handleSaveWallet = async () => {
    if (!user?.id) return;

    const trimmedAddress = walletAddress.trim();

    if (!trimmedAddress) {
      setSaveError('Please enter a wallet address');
      return;
    }

    if (!isValidAddress(trimmedAddress)) {
      setSaveError('Invalid wallet address format');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Try RPC function first
      const { error: rpcError } = await supabase.rpc('save_user_wallet', {
        p_user_id: user.id,
        p_wallet_address: trimmedAddress.toLowerCase()
      });

      if (rpcError) {
        // Fallback: Update directly
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ wallet_address: trimmedAddress.toLowerCase() })
          .eq('id', user.id);

        if (profileError) throw profileError;

        // Also update subscription
        await supabase
          .from('subscriptions')
          .update({ wallet_address: trimmedAddress.toLowerCase() })
          .eq('user_id', user.id);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving wallet:', err);
      setSaveError(err.message || 'Failed to save wallet address');
    } finally {
      setIsSaving(false);
    }
  };

  const getTierBadge = () => {
    const tier = subscription?.plan_tier || 'free';
    const colors: Record<string, string> = {
      free: 'bg-gray-500/20 text-gray-400',
      starter: 'bg-blue-500/20 text-blue-400',
      pro: 'bg-purple-500/20 text-purple-400',
      elite: 'bg-yellow-500/20 text-yellow-400',
      lifetime: 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400'
    };
    return colors[tier] || colors.free;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl mx-auto"
    >
      <h2 className="font-display text-2xl mb-6">Account Settings</h2>

      {/* Profile Card */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{profile?.full_name || 'User'}</h3>
            <p className="text-gray-400 text-sm">{user?.email}</p>
            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getTierBadge()}`}>
              <Crown className="w-3 h-3" />
              {(subscription?.plan_tier || 'free').toUpperCase()}
            </div>
          </div>
        </div>

        {/* Subscription Status */}
        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-400" />
              <span className="text-white font-medium">Subscription</span>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              subscription?.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {subscription?.status || 'inactive'}
            </span>
          </div>
        </div>

        {/* Wallet Address Section */}
        <div className="border-t border-gray-800 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-white" />
            <h4 className="text-white font-medium">Wallet Address</h4>
          </div>

          <p className="text-gray-400 text-sm mb-4">
            Enter your wallet address to link it to your account. This wallet will be used for auto-trading.
          </p>

          <div className="flex gap-3">
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => {
                setWalletAddress(e.target.value);
                setSaveError(null);
                setSaveSuccess(false);
              }}
              placeholder="0x..."
              className="flex-1 bg-white/5 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 font-mono text-sm"
            />
            <button
              onClick={handleSaveWallet}
              disabled={isSaving || !walletAddress.trim()}
              className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveSuccess ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save'}
            </button>
          </div>

          {/* Error Message */}
          {saveError && (
            <div className="flex items-center gap-2 mt-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {saveError}
            </div>
          )}

          {/* Success Message */}
          {saveSuccess && (
            <div className="flex items-center gap-2 mt-3 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              Wallet address saved and linked to your account!
            </div>
          )}

          {/* Current Linked Wallet */}
          {(profile?.wallet_address || subscription?.wallet_address) && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-green-400 text-sm">
                <strong>Currently Linked:</strong>{' '}
                <span className="font-mono">
                  {profile?.wallet_address || subscription?.wallet_address}
                </span>
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Instructions */}
      <Card className="p-6 bg-white/5">
        <h4 className="text-white font-medium mb-3">How it works</h4>
        <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
          <li>Enter your wallet address above and click Save</li>
          <li>Deposit USDC to the vault using the Dashboard</li>
          <li>Enable Auto-Trading in your Vault Settings</li>
          <li>The bot will automatically trade based on AI signals</li>
        </ol>
      </Card>
    </motion.div>
  );
};

export default SettingsPage;
