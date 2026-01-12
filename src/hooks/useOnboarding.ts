import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface OnboardingStatus {
  isLoading: boolean;
  isComplete: boolean;
  currentStep: 'profile' | 'wallet' | 'subscription' | 'complete';
  steps: {
    profile: {
      complete: boolean;
      hasName: boolean;
      hasCountry: boolean;
    };
    wallet: {
      complete: boolean;
      address: string | null;
    };
    subscription: {
      complete: boolean;
      plan: string | null;
      isActive: boolean;
    };
  };
  userId: string | null;
  refresh: () => Promise<void>;
}

export function useOnboarding(): OnboardingStatus {
  // Check localStorage for cached completion status to avoid flicker
  const cachedComplete = typeof window !== 'undefined'
    ? localStorage.getItem('onboarding_complete') === 'true'
    : false;

  const [status, setStatus] = useState<OnboardingStatus>({
    isLoading: true,
    isComplete: cachedComplete, // Use cached value while loading
    currentStep: cachedComplete ? 'complete' : 'profile',
    steps: {
      profile: { complete: cachedComplete, hasName: cachedComplete, hasCountry: cachedComplete },
      wallet: { complete: cachedComplete, address: null },
      subscription: { complete: cachedComplete, plan: null, isActive: cachedComplete },
    },
    userId: null,
    refresh: async () => {},
  });

  const checkOnboarding = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, country, wallet_address, onboarding_completed')
        .eq('id', user.id)
        .single();

      // Get subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan_tier, status, wallet_address')
        .eq('user_id', user.id)
        .single();

      const hasName = !!(profile?.full_name && profile.full_name.trim() !== '');
      const hasCountry = !!(profile?.country && profile.country.trim() !== '');
      const profileComplete = hasName && hasCountry;

      const walletAddress = profile?.wallet_address || subscription?.wallet_address || null;
      const walletComplete = !!walletAddress;

      const hasActiveSubscription = subscription?.status === 'active';
      const hasPaidPlan = subscription?.plan_tier && subscription.plan_tier !== 'free';
      const subscriptionComplete = hasActiveSubscription && hasPaidPlan;

      // Determine current step
      let currentStep: 'profile' | 'wallet' | 'subscription' | 'complete' = 'profile';
      if (profileComplete) {
        currentStep = 'wallet';
        if (walletComplete) {
          currentStep = 'subscription';
          if (subscriptionComplete) {
            currentStep = 'complete';
          }
        }
      }

      const isComplete = profileComplete && walletComplete && subscriptionComplete;

      // Cache completion status to avoid flicker on next load
      if (typeof window !== 'undefined') {
        localStorage.setItem('onboarding_complete', isComplete ? 'true' : 'false');
      }

      setStatus({
        isLoading: false,
        isComplete,
        currentStep,
        steps: {
          profile: {
            complete: profileComplete,
            hasName,
            hasCountry,
          },
          wallet: {
            complete: walletComplete,
            address: walletAddress,
          },
          subscription: {
            complete: subscriptionComplete,
            plan: subscription?.plan_tier || null,
            isActive: hasActiveSubscription,
          },
        },
        userId: user.id,
        refresh: checkOnboarding,
      });
    } catch (error) {
      console.error('Error checking onboarding:', error);
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  };

  useEffect(() => {
    checkOnboarding();
  }, []);

  return status;
}

// Helper to check if user can trade
export function canUserTrade(status: OnboardingStatus): { canTrade: boolean; reason?: string } {
  if (status.isLoading) {
    return { canTrade: false, reason: 'Loading...' };
  }

  if (!status.steps.profile.complete) {
    return { canTrade: false, reason: 'Please complete your profile first' };
  }

  if (!status.steps.wallet.complete) {
    return { canTrade: false, reason: 'Please connect your wallet first' };
  }

  if (!status.steps.subscription.isActive) {
    return { canTrade: false, reason: 'Please activate a subscription first' };
  }

  if (!status.steps.subscription.complete) {
    return { canTrade: false, reason: 'Please upgrade to a paid plan to trade' };
  }

  return { canTrade: true };
}
