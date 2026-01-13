import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  PlanTier,
  BillingCycle,
  UserSubscription,
  SUBSCRIPTION_PLANS,
  canMakeTrade,
  hasFeature,
  isStrategyAllowed,
  isChainAllowed,
  getDaysRemaining,
  getRemainingDailyTrades,
  validateLicenseFormat,
  generateMachineFingerprint,
  createFreeSubscription,
  PlanFeatures
} from '../lib/subscription';
import { supabase } from '../lib/supabase';

// Legacy types for backwards compatibility
export interface Subscription {
  id: string;
  type: 'trading_bot' | 'software_license';
  tier: 'free' | 'starter' | 'pro' | 'elite' | 'lifetime';
  name: string;
  price: number;
  billingCycle: 'monthly' | 'yearly' | 'one_time';
  status: 'active' | 'expired' | 'cancelled';
  startDate: Date;
  endDate?: Date;
  features: string[];
}

interface SubscriptionContextType {
  // Legacy fields
  subscriptions: Subscription[];
  kycStatus: 'pending' | 'verified' | 'rejected';
  creditLine: number;
  activeSubscription: Subscription | null;
  addSubscription: (subscription: Omit<Subscription, 'id' | 'startDate' | 'status'>) => void;
  cancelSubscription: (id: string) => void;
  verifyKYC: () => void;
  getCreditLineByTier: (tier: string) => number;

  // New subscription system
  subscription: UserSubscription | null;
  isLoading: boolean;
  error: string | null;
  isSubscribed: boolean;
  planTier: PlanTier | null;
  daysRemaining: number;
  dailyTradesRemaining: number;

  // Feature checks
  canTrade: () => { allowed: boolean; reason?: string };
  checkFeature: (feature: keyof PlanFeatures) => boolean;
  checkStrategy: (strategy: string) => boolean;
  checkChain: (chainId: number) => boolean;

  // Actions
  activateLicense: (code: string) => Promise<{ success: boolean; error?: string }>;
  recordTrade: () => void;
  refreshSubscription: () => Promise<void>;
  linkWallet: (walletAddress: string) => Promise<void>;

  // Upgrade prompts
  showUpgradeModal: boolean;
  upgradeReason: string;
  openUpgradeModal: (reason: string) => void;
  closeUpgradeModal: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Legacy state
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() => {
    const saved = localStorage.getItem('userSubscriptions');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((s: any) => ({
        ...s,
        startDate: new Date(s.startDate),
        endDate: s.endDate ? new Date(s.endDate) : undefined
      }));
    }
    return [];
  });

  const [kycStatus, setKycStatus] = useState<'pending' | 'verified' | 'rejected'>(() => {
    const saved = localStorage.getItem('kycStatus');
    return (saved as 'pending' | 'verified' | 'rejected') || 'pending';
  });

  // New subscription system state
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState('');

  // Load subscription from Supabase (with localStorage fallback)
  useEffect(() => {
    const loadSubscription = async () => {
      try {
        setIsLoading(true);

        // Check if user is authenticated
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          // Fetch subscription from Supabase
          const { data: dbSub, error: dbError } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (dbSub && !dbError) {
            // Convert database record to UserSubscription
            const sub: UserSubscription = {
              id: dbSub.id,
              userId: dbSub.user_id,
              walletAddress: dbSub.wallet_address || '',
              planTier: dbSub.plan_tier as PlanTier,
              billingCycle: dbSub.billing_cycle as BillingCycle,
              status: dbSub.status as 'active' | 'expired' | 'cancelled' | 'pending',
              startDate: new Date(dbSub.start_date),
              endDate: new Date(dbSub.end_date),
              autoRenew: dbSub.auto_renew,
              licenseCode: dbSub.license_code || undefined,
              dailyTradesUsed: dbSub.daily_trades_used,
              dailyTradesResetAt: new Date(dbSub.daily_trades_reset_at),
              totalTradesUsed: dbSub.total_trades_used || 0,
              timezone: dbSub.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
            };

            // Reset daily trades if needed
            const now = new Date();
            if (now > sub.dailyTradesResetAt) {
              sub.dailyTradesUsed = 0;
              sub.dailyTradesResetAt = new Date(now.setHours(24, 0, 0, 0));

              // Update in database
              await supabase.from('subscriptions').update({
                daily_trades_used: 0,
                daily_trades_reset_at: sub.dailyTradesResetAt.toISOString()
              }).eq('id', dbSub.id);
            }

            // Check if expired (except lifetime/free)
            if (sub.billingCycle !== 'lifetime' && sub.planTier !== 'free' && now > sub.endDate && sub.status === 'active') {
              sub.status = 'expired';
              await supabase.from('subscriptions').update({ status: 'expired' }).eq('id', dbSub.id);
            }

            setSubscription(sub);
            localStorage.setItem('monadier_subscription', JSON.stringify(sub));
            return;
          }
        }

        // Fallback: Load from localStorage or create free tier
        const stored = localStorage.getItem('monadier_subscription');
        if (stored) {
          const sub = JSON.parse(stored);
          sub.startDate = new Date(sub.startDate);
          sub.endDate = new Date(sub.endDate);
          sub.dailyTradesResetAt = new Date(sub.dailyTradesResetAt);
          setSubscription(sub);
        } else {
          // No subscription found - create FREE tier for new users
          const freeSub = createFreeSubscription('');
          setSubscription(freeSub);
          localStorage.setItem('monadier_subscription', JSON.stringify(freeSub));
        }
      } catch (err) {
        console.error('Failed to load subscription:', err);
        setError('Failed to load subscription');
        // Still create free tier on error
        const freeSub = createFreeSubscription('');
        setSubscription(freeSub);
      } finally {
        setIsLoading(false);
      }
    };

    loadSubscription();

    // Listen for auth changes to reload subscription
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        loadSubscription();
      }
    });

    return () => {
      authSub.unsubscribe();
    };
  }, []);

  // Save subscriptions to localStorage
  useEffect(() => {
    localStorage.setItem('userSubscriptions', JSON.stringify(subscriptions));
  }, [subscriptions]);

  useEffect(() => {
    localStorage.setItem('kycStatus', kycStatus);
  }, [kycStatus]);

  useEffect(() => {
    if (subscription) {
      localStorage.setItem('monadier_subscription', JSON.stringify(subscription));
    }
  }, [subscription]);

  // Legacy: Get active subscription
  const activeSubscription = subscriptions.find(
    s => s.type === 'trading_bot' && s.status === 'active'
  ) || null;

  // Legacy: Credit line by tier
  const getCreditLineByTier = (tier: string): number => {
    switch (tier) {
      case 'starter': return 1000;
      case 'pro': return 5000;
      case 'elite': return 15000;
      case 'lifetime': return 25000;
      default: return 0;
    }
  };

  const creditLine = activeSubscription
    ? getCreditLineByTier(activeSubscription.tier)
    : 0;

  // Legacy: Add subscription
  const addSubscription = (subscriptionData: Omit<Subscription, 'id' | 'startDate' | 'status'>) => {
    const newSubscription: Subscription = {
      ...subscriptionData,
      id: Math.random().toString(36).substring(2, 11),
      startDate: new Date(),
      status: 'active',
      endDate: subscriptionData.billingCycle === 'one_time'
        ? undefined
        : new Date(Date.now() + (subscriptionData.billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000)
    };

    if (subscriptionData.type === 'trading_bot') {
      setSubscriptions(prev => [
        ...prev.map(s =>
          s.type === 'trading_bot' ? { ...s, status: 'expired' as const } : s
        ),
        newSubscription
      ]);

      // Also create new-style subscription
      const now = new Date();
      const endDate = new Date(now);
      if (subscriptionData.billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else if (subscriptionData.billingCycle === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else {
        endDate.setFullYear(endDate.getFullYear() + 100); // "lifetime"
      }

      const planTier = subscriptionData.tier === 'lifetime' ? 'elite' : subscriptionData.tier as PlanTier;

      const newSub: UserSubscription = {
        id: `sub_${Date.now()}`,
        userId: `user_${Date.now()}`,
        walletAddress: '',
        planTier,
        billingCycle: subscriptionData.billingCycle === 'one_time' ? 'lifetime' : subscriptionData.billingCycle as BillingCycle,
        status: 'active',
        startDate: now,
        endDate,
        autoRenew: subscriptionData.billingCycle !== 'one_time',
        dailyTradesUsed: 0,
        dailyTradesResetAt: new Date(now.setHours(24, 0, 0, 0)),
        totalTradesUsed: 0,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      };

      setSubscription(newSub);
    } else {
      setSubscriptions(prev => [...prev, newSubscription]);
    }
  };

  // Legacy: Cancel subscription
  const cancelSubscription = (id: string) => {
    setSubscriptions(prev =>
      prev.map(s => (s.id === id ? { ...s, status: 'cancelled' as const } : s))
    );
    if (subscription) {
      setSubscription({ ...subscription, status: 'cancelled' });
    }
  };

  // Legacy: Verify KYC
  const verifyKYC = () => {
    setKycStatus('verified');
  };

  // New system: Computed values
  const isSubscribed = useMemo(() => {
    return subscription?.status === 'active' && new Date() <= new Date(subscription.endDate);
  }, [subscription]);

  const planTier = useMemo(() => {
    return isSubscribed ? subscription?.planTier || null : null;
  }, [isSubscribed, subscription]);

  const daysRemaining = useMemo(() => {
    return subscription ? getDaysRemaining(subscription) : 0;
  }, [subscription]);

  const dailyTradesRemaining = useMemo(() => {
    return subscription ? getRemainingDailyTrades(subscription) : 0;
  }, [subscription]);

  // Feature checks
  const canTrade = useCallback(() => {
    if (!subscription) {
      return { allowed: false, reason: 'No active subscription' };
    }
    return canMakeTrade(subscription);
  }, [subscription]);

  const checkFeature = useCallback((feature: keyof PlanFeatures) => {
    if (!planTier) return false;
    return hasFeature(planTier, feature);
  }, [planTier]);

  const checkStrategy = useCallback((strategy: string) => {
    if (!planTier) return false;
    return isStrategyAllowed(planTier, strategy);
  }, [planTier]);

  const checkChain = useCallback((chainId: number) => {
    if (!planTier) return false;
    return isChainAllowed(planTier, chainId);
  }, [planTier]);

  // Record a trade (updates both local state and Supabase)
  const recordTrade = useCallback(async () => {
    if (!subscription) return;

    const newDailyCount = subscription.dailyTradesUsed + 1;
    const newTotalCount = (subscription.totalTradesUsed || 0) + 1;

    // Update local state
    setSubscription(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        dailyTradesUsed: newDailyCount,
        totalTradesUsed: newTotalCount
      };
    });

    // Update Supabase
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('subscriptions').update({
          daily_trades_used: newDailyCount,
          total_trades_used: newTotalCount,
          updated_at: new Date().toISOString()
        }).eq('user_id', user.id);
      }
    } catch (err) {
      console.error('Failed to record trade in database:', err);
    }
  }, [subscription]);

  // Activate license code
  const activateLicense = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const validation = validateLicenseFormat(code);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const tier = validation.planTier!;

      // Free tier doesn't need license activation
      if (tier === 'free') {
        return { success: false, error: 'Free tier does not require a license code' };
      }

      if (tier === 'desktop') {
        const machineFingerprint = generateMachineFingerprint();
        console.log('Desktop license activated on machine:', machineFingerprint);
      }

      const now = new Date();
      const endDate = new Date(now);

      // Desktop is lifetime (100 years), others depend on billing cycle
      if (tier === 'desktop') {
        endDate.setFullYear(endDate.getFullYear() + 100); // Lifetime
      } else {
        endDate.setFullYear(endDate.getFullYear() + 1); // Default to yearly
      }

      const newSubscription: UserSubscription = {
        id: `sub_${Date.now()}`,
        userId: `user_${Date.now()}`,
        walletAddress: '',
        planTier: tier,
        billingCycle: tier === 'desktop' ? 'lifetime' : 'yearly',
        status: 'active',
        startDate: now,
        endDate,
        autoRenew: tier !== 'desktop',
        licenseCode: code,
        dailyTradesUsed: 0,
        dailyTradesResetAt: new Date(now.setHours(24, 0, 0, 0)),
        totalTradesUsed: 0,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      };

      setSubscription(newSubscription);

      // Also add to legacy subscriptions
      const legacySub: Subscription = {
        id: newSubscription.id,
        type: 'trading_bot',
        tier: tier === 'desktop' ? 'elite' : tier as 'free' | 'starter' | 'pro' | 'elite',
        name: SUBSCRIPTION_PLANS[tier].name,
        price: tier === 'desktop' ? SUBSCRIPTION_PLANS[tier].lifetimePrice : SUBSCRIPTION_PLANS[tier].yearlyPrice,
        billingCycle: tier === 'desktop' ? 'one_time' : 'yearly',
        status: 'active',
        startDate: now,
        endDate,
        features: SUBSCRIPTION_PLANS[tier].features.strategies
      };

      setSubscriptions(prev => [
        ...prev.map(s =>
          s.type === 'trading_bot' ? { ...s, status: 'expired' as const } : s
        ),
        legacySub
      ]);

      return { success: true };
    } catch (err) {
      console.error('License activation failed:', err);
      return { success: false, error: 'Failed to activate license' };
    }
  }, []);

  // Refresh subscription
  const refreshSubscription = useCallback(async () => {
    if (subscription) {
      const now = new Date();
      if (now > subscription.endDate && subscription.status === 'active') {
        setSubscription(prev => prev ? { ...prev, status: 'expired' } : null);
      }
    }
  }, [subscription]);

  // Link wallet to subscription (for bot trading)
  // Now supports MULTIPLE wallets per user - adds to user_wallets table
  const linkWallet = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No authenticated user, skipping wallet link');
        return;
      }

      // Add to user_wallets table (supports multiple wallets)
      const { error: walletError } = await supabase
        .from('user_wallets')
        .upsert({
          user_id: user.id,
          wallet_address: walletAddress.toLowerCase()
        }, {
          onConflict: 'user_id,wallet_address'
        });

      if (walletError) {
        console.error('Failed to add to user_wallets:', walletError);
      } else {
        console.log('Wallet added to user_wallets:', walletAddress);
      }

      // Also update vault_settings with user_id
      await supabase
        .from('vault_settings')
        .update({ user_id: user.id })
        .eq('wallet_address', walletAddress.toLowerCase());

      // Update subscription with this wallet (for backward compatibility)
      if (subscription) {
        const { error } = await supabase
          .from('subscriptions')
          .update({ wallet_address: walletAddress.toLowerCase() })
          .eq('id', subscription.id);

        if (!error) {
          setSubscription(prev => prev ? { ...prev, walletAddress: walletAddress.toLowerCase() } : null);
        }
      }

      console.log('Wallet linked successfully:', walletAddress);
    } catch (err) {
      console.error('Failed to link wallet:', err);
    }
  }, [subscription]);

  // Upgrade modal
  const openUpgradeModal = useCallback((reason: string) => {
    setUpgradeReason(reason);
    setShowUpgradeModal(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setShowUpgradeModal(false);
    setUpgradeReason('');
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        // Legacy
        subscriptions,
        kycStatus,
        creditLine,
        activeSubscription,
        addSubscription,
        cancelSubscription,
        verifyKYC,
        getCreditLineByTier,
        // New system
        subscription,
        isLoading,
        error,
        isSubscribed,
        planTier,
        daysRemaining,
        dailyTradesRemaining,
        canTrade,
        checkFeature,
        checkStrategy,
        checkChain,
        activateLicense,
        recordTrade,
        refreshSubscription,
        linkWallet,
        showUpgradeModal,
        upgradeReason,
        openUpgradeModal,
        closeUpgradeModal
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
