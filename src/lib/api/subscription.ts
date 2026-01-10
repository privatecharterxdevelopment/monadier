// Subscription API Client for Supabase Edge Functions
import { supabase } from '../supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Types
export interface CheckoutResponse {
  sessionId: string;
  url: string;
}

export interface SubscriptionResponse {
  subscription: {
    id: string;
    planTier: string;
    billingCycle: string;
    status: string;
    startDate: string;
    endDate: string;
    autoRenew: boolean;
    licenseCode?: string;
    dailyTradesUsed: number;
    dailyTradesResetAt: string;
  } | null;
  planTier: string;
  status: string;
  dailyTradesRemaining: number;
  dailyTradeLimit: number;
}

export interface LicenseActivationResponse {
  success: boolean;
  subscription: {
    planTier: string;
    billingCycle: string;
    status: string;
    startDate: string;
    endDate: string;
    dailyTradeLimit: number;
    licenseCode: string;
  };
}

// Get auth token for API calls (with session refresh)
async function getAuthToken(): Promise<string> {
  // Try to refresh the session first
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    // Try refreshing the session
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session?.access_token) {
      throw new Error('Not authenticated - please log in again');
    }
    return refreshData.session.access_token;
  }

  // Check if token is about to expire (within 5 minutes)
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - now < fiveMinutes) {
    // Refresh the session
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session?.access_token) {
      return refreshData.session.access_token;
    }
  }

  return session.access_token;
}

// Create Stripe checkout session
export async function createCheckoutSession(
  planTier: 'starter' | 'pro' | 'elite' | 'desktop',
  billingCycle: 'monthly' | 'yearly' | 'lifetime',
  walletAddress?: string
): Promise<CheckoutResponse> {
  const token = await getAuthToken();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      planTier,
      billingCycle,
      walletAddress,
      successUrl: `${window.location.origin}/dashboard?checkout=success`,
      cancelUrl: `${window.location.origin}/pricing?checkout=cancelled`,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create checkout session');
  }

  return response.json();
}

// Get current subscription
export async function getSubscription(): Promise<SubscriptionResponse> {
  const token = await getAuthToken();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-subscription`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get subscription');
  }

  return response.json();
}

// Cancel subscription
export async function cancelSubscription(): Promise<{ success: boolean; message: string; endDate: string }> {
  const token = await getAuthToken();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'cancel' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel subscription');
  }

  return response.json();
}

// Resume subscription
export async function resumeSubscription(): Promise<{ success: boolean; message: string }> {
  const token = await getAuthToken();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'resume' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to resume subscription');
  }

  return response.json();
}

// Get Stripe customer portal URL
export async function getCustomerPortalUrl(): Promise<{ url: string }> {
  const token = await getAuthToken();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'portal' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get portal URL');
  }

  return response.json();
}

// Record a trade (increment daily counter)
export async function recordTrade(): Promise<{
  success: boolean;
  dailyTradesUsed: number;
  dailyTradesRemaining: number;
}> {
  const token = await getAuthToken();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'record_trade' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to record trade');
  }

  return response.json();
}

// Activate license code
export async function activateLicense(
  licenseCode: string,
  walletAddress?: string,
  machineId?: string
): Promise<LicenseActivationResponse> {
  const token = await getAuthToken();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/activate-license`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      licenseCode,
      walletAddress,
      machineId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to activate license');
  }

  return response.json();
}

// Redirect to checkout
export async function redirectToCheckout(
  planTier: 'starter' | 'pro' | 'elite' | 'desktop',
  billingCycle: 'monthly' | 'yearly' | 'lifetime',
  walletAddress?: string
): Promise<void> {
  const { url } = await createCheckoutSession(planTier, billingCycle, walletAddress);
  window.location.href = url;
}

// Open customer portal in new tab
export async function openCustomerPortal(): Promise<void> {
  const { url } = await getCustomerPortalUrl();
  window.open(url, '_blank');
}

// Verify trade response
export interface VerifyTradeResponse {
  allowed: boolean;
  reason?: string;
  planTier: string;
  isPaperOnly?: boolean;
  dailyTradesUsed?: number;
  dailyTradeLimit?: number;
  dailyTradesRemaining?: number;
  resetsAt?: string;
  allowedChains?: number[];
}

// Verify if user can make a trade (server-side verification)
export async function verifyTrade(
  chainId: number,
  isPaperTrade: boolean = false
): Promise<VerifyTradeResponse> {
  const token = await getAuthToken();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-trade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      chainId,
      isPaperTrade,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      allowed: false,
      reason: data.reason || data.error || 'Failed to verify trade',
      planTier: data.planTier || 'free',
      isPaperOnly: data.isPaperOnly,
      dailyTradesUsed: data.dailyTradesUsed,
      dailyTradeLimit: data.dailyTradeLimit,
      resetsAt: data.resetsAt,
      allowedChains: data.allowedChains,
    };
  }

  return data;
}
