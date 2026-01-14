import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Wallet, Save, CheckCircle, AlertCircle, Loader2, Crown, Shield, Clock, TrendingUp, Users, Gift, Copy, Zap, Rocket, Calendar, CreditCard, ExternalLink, FileCheck, X, Plus } from 'lucide-react';
import Card from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { supabase } from '../../lib/supabase';
import { SUBSCRIPTION_PLANS } from '../../lib/subscription';
import { Link } from 'react-router-dom';
import { VaultBalanceCard } from '../../components/vault';

interface ReferralReward {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: 'pending' | 'qualified' | 'paid' | 'expired';
  referrer_reward_cents: number;
  referred_reward_cents: number;
  created_at: string;
  referred_email?: string;
}

const SettingsPage: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { subscription, isSubscribed, planTier } = useSubscription();

  // Profile fields
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

  // Multi-wallet support
  const [linkedWallets, setLinkedWallets] = useState<string[]>([]);
  const [isLoadingWallets, setIsLoadingWallets] = useState(true);
  const [newWalletInput, setNewWalletInput] = useState('');

  // UI state
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Referral state
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferralReward[]>([]);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // Load profile data
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setCountry(profile.country || '');
    }
  }, [profile]);

  // Load ALL linked wallets from user_wallets table
  useEffect(() => {
    const loadLinkedWallets = async () => {
      if (!user?.id) return;

      setIsLoadingWallets(true);
      try {
        const { data, error } = await supabase
          .from('user_wallets')
          .select('wallet_address')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Failed to load wallets:', error);
        } else if (data) {
          setLinkedWallets(data.map(w => w.wallet_address));
        }
      } catch (err) {
        console.error('Error loading wallets:', err);
      } finally {
        setIsLoadingWallets(false);
      }
    };

    loadLinkedWallets();
  }, [user?.id]);

  // Set current wallet from profile/subscription
  useEffect(() => {
    if (profile?.wallet_address) {
      setWalletAddress(profile.wallet_address);
    } else if (subscription?.wallet_address) {
      setWalletAddress(subscription.wallet_address);
    }
  }, [profile, subscription]);

  // Load referral code and referrals
  useEffect(() => {
    const loadReferralData = async () => {
      if (!user?.id) return;

      setIsLoadingReferrals(true);
      try {
        // Get or create referral code
        const { data: codeData } = await supabase
          .from('referral_codes')
          .select('code')
          .eq('user_id', user.id)
          .single();

        if (codeData?.code) {
          setReferralCode(codeData.code);
        } else {
          // Generate new code via RPC
          const { data: newCode } = await supabase.rpc('generate_referral_code', {
            p_user_id: user.id
          });
          if (newCode) {
            setReferralCode(newCode);
          }
        }

        // Get referrals made by this user
        const { data: referralsData } = await supabase
          .from('referral_rewards')
          .select(`
            id,
            referrer_id,
            referred_id,
            referral_code,
            status,
            referrer_reward_cents,
            referred_reward_cents,
            created_at
          `)
          .eq('referrer_id', user.id)
          .order('created_at', { ascending: false });

        if (referralsData) {
          // Get emails for referred users
          const referredIds = referralsData.map(r => r.referred_id);
          if (referredIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, email')
              .in('id', referredIds);

            const emailMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

            setReferrals(referralsData.map(r => ({
              ...r,
              referred_email: emailMap.get(r.referred_id) || 'Unknown'
            })));
          } else {
            setReferrals([]);
          }
        }
      } catch (err) {
        console.error('Failed to load referral data:', err);
      } finally {
        setIsLoadingReferrals(false);
      }
    };

    loadReferralData();
  }, [user?.id]);

  const isValidAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Save profile (name & country)
  const handleSaveProfile = async () => {
    if (!user?.id) return;

    if (!fullName.trim()) {
      setProfileSaveError('Please enter your full name');
      return;
    }

    if (!country.trim()) {
      setProfileSaveError('Please enter your country');
      return;
    }

    setIsSavingProfile(true);
    setProfileSaveError(null);
    setProfileSaveSuccess(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          country: country.trim()
        })
        .eq('id', user.id);

      if (error) throw error;

      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 3000);

      // Refresh profile in context
      if (refreshProfile) {
        await refreshProfile();
      }
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setProfileSaveError(err.message || 'Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Add a new wallet to user_wallets
  const handleAddWallet = async () => {
    if (!user?.id) return;

    const trimmedAddress = newWalletInput.trim().toLowerCase();

    if (!trimmedAddress) {
      setSaveError('Please enter a wallet address');
      return;
    }

    if (!isValidAddress(trimmedAddress)) {
      setSaveError('Invalid wallet address format');
      return;
    }

    if (linkedWallets.includes(trimmedAddress)) {
      setSaveError('This wallet is already linked');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Insert into user_wallets
      const { error } = await supabase
        .from('user_wallets')
        .insert({
          user_id: user.id,
          wallet_address: trimmedAddress
        });

      if (error) {
        if (error.code === '23505') {
          setSaveError('This wallet is already linked');
        } else {
          throw error;
        }
      } else {
        // Update local state
        setLinkedWallets(prev => [...prev, trimmedAddress]);
        setNewWalletInput('');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      console.error('Error adding wallet:', err);
      setSaveError(err.message || 'Failed to add wallet');
    } finally {
      setIsSaving(false);
    }
  };

  // Remove a wallet from user_wallets
  const handleRemoveWallet = async (walletToRemove: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('user_wallets')
        .delete()
        .eq('user_id', user.id)
        .eq('wallet_address', walletToRemove.toLowerCase());

      if (error) throw error;

      // Update local state
      setLinkedWallets(prev => prev.filter(w => w !== walletToRemove.toLowerCase()));
    } catch (err: any) {
      console.error('Error removing wallet:', err);
      setSaveError(err.message || 'Failed to remove wallet');
    }
  };

  // Legacy: Save primary wallet (for backwards compatibility)
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

  // Get actual tier from subscription object (not computed planTier which depends on isSubscribed)
  const actualTier = subscription?.planTier || 'free';

  const getTierBadge = () => {
    const colors: Record<string, string> = {
      free: 'bg-gray-500/20 text-gray-400',
      starter: 'bg-blue-500/20 text-blue-400',
      pro: 'bg-purple-500/20 text-purple-400',
      elite: 'bg-yellow-500/20 text-yellow-400',
      desktop: 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400'
    };
    return colors[actualTier] || colors.free;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="font-display text-2xl mb-6">Profile</h2>

      {/* Two column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Profile & Wallet */}
        <div className="space-y-6">
          {/* Profile Card */}
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{profile?.full_name || 'Complete your profile'}</h3>
                <p className="text-gray-400 text-sm">{user?.email}</p>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getTierBadge()}`}>
                  <Crown className="w-3 h-3" />
                  {actualTier.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Editable Profile Fields */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setProfileSaveError(null);
                  }}
                  placeholder="John Smith"
                  className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Country *</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setProfileSaveError(null);
                  }}
                  placeholder="Switzerland"
                  className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
                />
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile || !fullName.trim() || !country.trim()}
                className="w-full px-4 py-3 bg-accent text-black font-semibold rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingProfile ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : profileSaveSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Profile Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Profile
                  </>
                )}
              </button>

              {profileSaveError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {profileSaveError}
                </div>
              )}
            </div>

            {/* Subscription Status */}
            <div className="bg-white/5 rounded-lg p-4">
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
          </Card>

          {/* Multi-Wallet Card */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-white" />
              <h4 className="text-white font-medium">Linked Wallets</h4>
              <span className="ml-auto text-gray-500 text-xs">
                {linkedWallets.length} wallet{linkedWallets.length !== 1 ? 's' : ''}
              </span>
            </div>

            <p className="text-gray-400 text-sm mb-4">
              All wallets linked to your account can be used for auto-trading.
            </p>

            {/* Linked Wallets List */}
            {isLoadingWallets ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
              </div>
            ) : linkedWallets.length === 0 ? (
              <div className="text-center py-4 bg-white/5 rounded-lg mb-4">
                <Wallet className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No wallets linked yet</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {linkedWallets.map((wallet, index) => (
                  <div
                    key={wallet}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${index === 0 ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <code className="text-white font-mono text-xs truncate">
                        {wallet}
                      </code>
                      {index === 0 && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                          Primary
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveWallet(wallet)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded transition-all"
                      title="Remove wallet"
                    >
                      <X className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Wallet */}
            <div className="flex gap-3">
              <input
                type="text"
                value={newWalletInput}
                onChange={(e) => {
                  setNewWalletInput(e.target.value);
                  setSaveError(null);
                }}
                placeholder="0x... (add new wallet)"
                className="flex-1 bg-white/5 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 font-mono text-sm"
              />
              <button
                onClick={handleAddWallet}
                disabled={isSaving || !newWalletInput.trim()}
                className="px-4 py-3 bg-accent text-black font-semibold rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add
                  </>
                )}
              </button>
            </div>

            {saveError && (
              <div className="flex items-center gap-2 mt-3 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {saveError}
              </div>
            )}

            {saveSuccess && (
              <div className="flex items-center gap-2 mt-3 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Wallet added!
              </div>
            )}
          </Card>

          {/* V8 Auto-Trading Vault */}
          <VaultBalanceCard />

          {/* Smart Contract Info - Compact */}
          <div className="p-4 bg-white/5 border border-gray-800 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <FileCheck className="w-4 h-4 text-blue-400" />
              <span className="text-white text-sm font-medium">V8 Vault Contract</span>
            </div>
            <p className="text-gray-500 text-xs mb-3">
              Non-custodial & verified on-chain. Your funds, your control.
            </p>
            <code className="block text-[10px] text-gray-400 font-mono mb-2 break-all">
              0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6
            </code>
            <a
              href="https://arbiscan.io/address/0x9020bD5Ff2eD31a05dd5B48E92624A5a0E952bf6#code"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
            >
              <ExternalLink size={12} />
              Verify on Arbiscan
            </a>
          </div>
        </div>

        {/* Right Column - My Plan & Referrals */}
        <div className="space-y-6">
          {/* My Plan Card */}
          <Card className="p-6">
            {/* Plan Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  actualTier === 'elite' ? 'bg-amber-500/20' :
                  actualTier === 'pro' ? 'bg-purple-500/20' :
                  actualTier === 'starter' ? 'bg-blue-500/20' :
                  actualTier === 'desktop' ? 'bg-emerald-500/20' :
                  'bg-gray-500/20'
                }`}>
                  {actualTier === 'elite' ? <Rocket className="w-6 h-6 text-amber-400" /> :
                   actualTier === 'pro' ? <Crown className="w-6 h-6 text-purple-400" /> :
                   actualTier === 'starter' ? <Zap className="w-6 h-6 text-blue-400" /> :
                   actualTier === 'desktop' ? <TrendingUp className="w-6 h-6 text-emerald-400" /> :
                   <TrendingUp className="w-6 h-6 text-gray-400" />}
                </div>
                <div>
                  <h4 className="font-semibold text-white text-lg">{SUBSCRIPTION_PLANS[actualTier]?.name || 'Free'} Plan</h4>
                  <p className="text-gray-500 text-xs">{SUBSCRIPTION_PLANS[actualTier]?.description || 'Try 2 real trades for free'}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                subscription?.status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}>
                {subscription?.status || 'active'}
              </span>
            </div>

            {/* Plan Details Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Trade Limit */}
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-gray-500 text-xs mb-1">Daily Trades</p>
                <p className="text-white font-semibold">
                  {actualTier === 'free' ? '2 total' :
                   actualTier === 'elite' || actualTier === 'desktop' ? 'Unlimited' :
                   `${SUBSCRIPTION_PLANS[actualTier]?.features.dailyTradeLimit}/day`}
                </p>
              </div>

              {/* Billing */}
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-gray-500 text-xs mb-1">Billing</p>
                <p className="text-white font-semibold">
                  {actualTier === 'free' ? 'Free' :
                   actualTier === 'desktop' ? 'Lifetime' :
                   subscription?.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}
                </p>
              </div>

              {/* Price */}
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-gray-500 text-xs mb-1">Price</p>
                <p className="text-white font-semibold">
                  {actualTier === 'free' ? '$0' :
                   `$${SUBSCRIPTION_PLANS[actualTier]?.monthlyPrice || 0}/mo`}
                </p>
              </div>

              {/* Chains */}
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-gray-500 text-xs mb-1">Chains</p>
                <p className="text-white font-semibold">
                  {actualTier === 'free' ? 'Base only' : 'All chains'}
                </p>
              </div>
            </div>

            {/* Trade Usage */}
            <div className="p-4 bg-white/5 rounded-lg mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 text-sm">
                  {actualTier === 'free' ? 'Trades Used' : 'Daily Usage'}
                </span>
                <span className="text-white font-medium">
                  {actualTier === 'free'
                    ? `${subscription?.totalTradesUsed || 0} / 2`
                    : actualTier === 'elite' || actualTier === 'desktop'
                      ? 'Unlimited'
                      : `${subscription?.dailyTradesUsed || 0} / ${SUBSCRIPTION_PLANS[actualTier]?.features.dailyTradeLimit || 0}`
                  }
                </span>
              </div>

              {/* Progress bar */}
              {actualTier !== 'elite' && actualTier !== 'desktop' && (
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      actualTier === 'free'
                        ? (subscription?.totalTradesUsed || 0) >= 2 ? 'bg-red-500' : 'bg-accent'
                        : (subscription?.dailyTradesUsed || 0) >= (SUBSCRIPTION_PLANS[actualTier]?.features.dailyTradeLimit || 1)
                          ? 'bg-red-500' : 'bg-accent'
                    }`}
                    style={{
                      width: actualTier === 'free'
                        ? `${Math.min(100, ((subscription?.totalTradesUsed || 0) / 2) * 100)}%`
                        : `${Math.min(100, ((subscription?.dailyTradesUsed || 0) / (SUBSCRIPTION_PLANS[actualTier]?.features.dailyTradeLimit || 1)) * 100)}%`
                    }}
                  />
                </div>
              )}
            </div>

            {/* Reset Time - only for paid daily plans */}
            {actualTier !== 'free' && actualTier !== 'elite' && actualTier !== 'desktop' && (
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
                <Clock className="w-4 h-4" />
                <span>Resets: {subscription?.dailyTradesResetAt
                  ? new Date(subscription.dailyTradesResetAt).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })
                  : 'Midnight'
                }</span>
              </div>
            )}

            {/* Status Messages */}
            {actualTier === 'free' && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
                <p className="text-yellow-400 text-sm">
                  {(subscription?.totalTradesUsed || 0) >= 2
                    ? 'Free trial ended. Upgrade to continue trading!'
                    : `${2 - (subscription?.totalTradesUsed || 0)} free trade${2 - (subscription?.totalTradesUsed || 0) === 1 ? '' : 's'} remaining`
                  }
                </p>
              </div>
            )}

            {(actualTier === 'elite' || actualTier === 'desktop') && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg mb-4">
                <p className="text-green-400 text-sm">
                  Unlimited trading with no daily limits
                </p>
              </div>
            )}

            {/* Upgrade/Manage Button */}
            <Link
              to="/dashboard/subscriptions"
              className={`w-full py-3 rounded-lg font-medium text-center block transition-colors ${
                actualTier === 'free'
                  ? 'bg-accent text-black hover:bg-accent/90'
                  : 'bg-white/5 text-white hover:bg-white/10 border border-gray-700'
              }`}
            >
              {actualTier === 'free' ? 'Upgrade Plan' : 'Manage Subscription'}
            </Link>
          </Card>

          {/* Referrals Card */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Referrals</h4>
                <p className="text-gray-500 text-xs">Earn $5 for each friend who subscribes</p>
              </div>
            </div>

            {/* Referral Link */}
            {referralCode && (
              <div className="p-4 bg-white/5 rounded-lg mb-4">
                <p className="text-gray-400 text-xs mb-2">Your Referral Link</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/30 px-3 py-2 rounded text-white font-mono text-xs truncate">
                    {`${window.location.origin}/register?ref=${referralCode}`}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/register?ref=${referralCode}`);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded transition-colors"
                  >
                    {copiedCode ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} className="text-gray-400" />}
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  Share this link with friends to earn rewards
                </p>
              </div>
            )}

            {/* Referrals List */}
            <div className="space-y-2">
              <p className="text-gray-400 text-xs font-medium">Your Referrals</p>

              {isLoadingReferrals ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                </div>
              ) : referrals.length === 0 ? (
                <div className="text-center py-6 bg-white/5 rounded-lg">
                  <Gift className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No referrals yet</p>
                  <p className="text-gray-600 text-xs">Share your code to start earning</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {referrals.map((referral) => (
                    <div
                      key={referral.id}
                      className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          referral.status === 'paid' ? 'bg-green-500' :
                          referral.status === 'qualified' ? 'bg-yellow-500' :
                          referral.status === 'pending' ? 'bg-blue-500' :
                          'bg-gray-500'
                        }`} />
                        <div>
                          <p className="text-white text-sm">
                            {referral.referred_email ?
                              referral.referred_email.replace(/(.{2})(.*)(@.*)/, '$1***$3') :
                              'User'
                            }
                          </p>
                          <p className="text-gray-500 text-xs">
                            {new Date(referral.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          referral.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                          referral.status === 'qualified' ? 'bg-yellow-500/20 text-yellow-400' :
                          referral.status === 'pending' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {referral.status === 'paid' ? 'Paid' :
                           referral.status === 'qualified' ? 'Qualified' :
                           referral.status === 'pending' ? 'Pending' :
                           'Expired'}
                        </span>
                        {referral.status === 'paid' && (
                          <p className="text-green-400 text-xs mt-1">
                            +${(referral.referrer_reward_cents / 100).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats Summary */}
              {referrals.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-800">
                  <div className="text-center">
                    <p className="text-white font-medium">{referrals.length}</p>
                    <p className="text-gray-500 text-xs">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-yellow-400 font-medium">
                      {referrals.filter(r => r.status === 'pending' || r.status === 'qualified').length}
                    </p>
                    <p className="text-gray-500 text-xs">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-green-400 font-medium">
                      ${(referrals.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.referrer_reward_cents, 0) / 100).toFixed(2)}
                    </p>
                    <p className="text-gray-500 text-xs">Earned</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};

export default SettingsPage;
