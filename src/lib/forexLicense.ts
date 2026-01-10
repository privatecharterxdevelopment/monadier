import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ============================================
// TYPES
// ============================================

export type ForexPlanType = 'forex-monthly' | 'forex-lifetime';

export interface ForexLicense {
  id: string;
  userId: string;
  licenseKey: string;
  planType: 'monthly' | 'lifetime';
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  tradesUsedToday: number;
  lastTradeDate: string | null;
  createdAt: string;
  expiresAt: string | null;
  paymentId?: string;
  paymentStatus?: 'pending' | 'completed' | 'failed';
}

export interface LicenseValidationResult {
  isValid: boolean;
  canTrade: boolean;
  tradesRemaining: number | null; // null = unlimited
  reason?: string;
  license?: ForexLicense;
}

export interface ForexCheckoutResponse {
  success: boolean;
  sessionId?: string;
  url?: string;
  error?: string;
}

export interface ForexPaymentStatus {
  status: 'pending' | 'completed' | 'failed' | 'not_found';
  license?: ForexLicense;
  message?: string;
}

// ============================================
// CONSTANTS
// ============================================

// Trade limit for monthly plans
export const MONTHLY_TRADE_LIMIT = 5;

// Pricing
export const FOREX_PRICING = {
  monthly: {
    price: 29,
    currency: 'USD',
    tradeLimit: MONTHLY_TRADE_LIMIT,
    features: ['Full MT5 EA access', 'All strategies', 'Regular updates', '5 trades/day', 'Email support']
  },
  lifetime: {
    price: 199,
    currency: 'USD',
    tradeLimit: -1, // unlimited
    features: ['Lifetime MT5 EA access', 'All strategies', 'Lifetime updates', 'Unlimited trades', 'Priority support']
  }
};

// ============================================
// AUTH HELPER
// ============================================

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return session.access_token;
}

// ============================================
// LICENSE KEY GENERATION
// ============================================

/**
 * Generate a unique license key for forex MT5
 */
export function generateForexLicenseKey(userId: string, planType: 'monthly' | 'lifetime'): string {
  const prefix = planType === 'lifetime' ? 'FX-LT' : 'FX-MO';
  const userPart = userId.replace(/-/g, '').substring(0, 8).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase().substring(0, 6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${userPart}-${timestamp}-${random}`;
}

/**
 * Check if a license key format is valid (basic format check)
 */
export function isValidLicenseKeyFormat(key: string): boolean {
  // Format: FX-LT-XXXXXXXX-XXXXXX-XXXX or FX-MO-XXXXXXXX-XXXXXX-XXXX
  const pattern = /^FX-(LT|MO)-[A-Z0-9]{8}-[A-Z0-9]{6}-[A-Z0-9]{4}$/;
  return pattern.test(key);
}

// ============================================
// CHECKOUT & PAYMENT
// ============================================

/**
 * Create a Stripe checkout session for Forex plans
 */
export async function createForexCheckout(
  planType: ForexPlanType
): Promise<ForexCheckoutResponse> {
  try {
    const token = await getAuthToken();
    const billingCycle = planType === 'forex-lifetime' ? 'lifetime' : 'monthly';

    const response = await fetch(`${SUPABASE_URL}/functions/v1/forex-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        planType,
        billingCycle,
        successUrl: `${window.location.origin}/dashboard/downloads?checkout=success&plan=${planType}`,
        cancelUrl: `${window.location.origin}/forex?checkout=cancelled`,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Failed to create checkout session' };
    }

    const data = await response.json();
    return { success: true, sessionId: data.sessionId, url: data.url };
  } catch (error) {
    console.error('Forex checkout error:', error);
    return { success: false, error: 'Failed to create checkout session' };
  }
}

/**
 * Redirect to Stripe checkout for Forex
 */
export async function redirectToForexCheckout(planType: ForexPlanType): Promise<void> {
  const result = await createForexCheckout(planType);
  if (result.success && result.url) {
    window.location.href = result.url;
  } else {
    throw new Error(result.error || 'Failed to redirect to checkout');
  }
}

/**
 * Check payment status after returning from checkout
 */
export async function checkForexPaymentStatus(sessionId?: string): Promise<ForexPaymentStatus> {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${SUPABASE_URL}/functions/v1/forex-payment-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { status: 'failed', message: error.error || 'Payment verification failed' };
    }

    return response.json();
  } catch (error) {
    console.error('Payment status check error:', error);
    return { status: 'failed', message: 'Failed to verify payment' };
  }
}

// ============================================
// LICENSE VALIDATION
// ============================================

/**
 * Validate a forex license and check trade limits
 */
export async function validateForexLicense(licenseKey: string): Promise<LicenseValidationResult> {
  try {
    // Query the license from database
    const { data: license, error } = await supabase
      .from('forex_licenses')
      .select('*')
      .eq('license_key', licenseKey)
      .single();

    if (error || !license) {
      return {
        isValid: false,
        canTrade: false,
        tradesRemaining: 0,
        reason: 'Invalid license key'
      };
    }

    // Check if payment is completed
    if (license.payment_status === 'pending') {
      return {
        isValid: false,
        canTrade: false,
        tradesRemaining: 0,
        reason: 'Payment is still pending. Please complete your purchase.'
      };
    }

    if (license.payment_status === 'failed') {
      return {
        isValid: false,
        canTrade: false,
        tradesRemaining: 0,
        reason: 'Payment failed. Please try again.'
      };
    }

    // Check if license is active
    if (license.status !== 'active') {
      return {
        isValid: false,
        canTrade: false,
        tradesRemaining: 0,
        reason: `License is ${license.status}`
      };
    }

    // Check expiration for monthly plans
    if (license.plan_type === 'monthly' && license.expires_at) {
      const expiresAt = new Date(license.expires_at);
      if (expiresAt < new Date()) {
        return {
          isValid: false,
          canTrade: false,
          tradesRemaining: 0,
          reason: 'License has expired. Please renew your subscription.'
        };
      }
    }

    // For lifetime plans, unlimited trades
    if (license.plan_type === 'lifetime') {
      return {
        isValid: true,
        canTrade: true,
        tradesRemaining: null, // unlimited
        license: mapLicenseFromDb(license)
      };
    }

    // For monthly plans, check daily trade limit
    const today = new Date().toISOString().split('T')[0];
    const lastTradeDate = license.last_trade_date?.split('T')[0];

    // Reset counter if it's a new day
    let tradesUsedToday = license.trades_used_today || 0;
    if (lastTradeDate !== today) {
      tradesUsedToday = 0;
    }

    const tradesRemaining = MONTHLY_TRADE_LIMIT - tradesUsedToday;
    const canTrade = tradesRemaining > 0;

    return {
      isValid: true,
      canTrade,
      tradesRemaining,
      reason: canTrade ? undefined : `Daily trade limit reached (${MONTHLY_TRADE_LIMIT}/day). Upgrade to lifetime for unlimited trades.`,
      license: {
        ...mapLicenseFromDb(license),
        tradesUsedToday
      }
    };
  } catch (error) {
    console.error('License validation error:', error);
    return {
      isValid: false,
      canTrade: false,
      tradesRemaining: 0,
      reason: 'Failed to validate license. Please try again.'
    };
  }
}

/**
 * Server-side license validation (for MT5 EA to call)
 */
export async function validateLicenseServerSide(licenseKey: string): Promise<LicenseValidationResult> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/validate-forex-license`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ licenseKey }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        isValid: false,
        canTrade: false,
        tradesRemaining: 0,
        reason: error.reason || 'License validation failed'
      };
    }

    return response.json();
  } catch (error) {
    console.error('Server-side validation error:', error);
    return {
      isValid: false,
      canTrade: false,
      tradesRemaining: 0,
      reason: 'Failed to validate license'
    };
  }
}

// ============================================
// TRADE RECORDING
// ============================================

/**
 * Record a trade for a monthly license (increment counter)
 */
export async function recordForexTrade(licenseKey: string): Promise<{
  success: boolean;
  tradesRemaining: number | null;
  error?: string;
}> {
  try {
    // First validate the license
    const validation = await validateForexLicense(licenseKey);

    if (!validation.isValid) {
      return { success: false, tradesRemaining: 0, error: validation.reason };
    }

    if (!validation.canTrade) {
      return { success: false, tradesRemaining: 0, error: validation.reason };
    }

    // For lifetime plans, no need to track
    if (validation.license?.planType === 'lifetime') {
      return { success: true, tradesRemaining: null };
    }

    // Update the trade counter for monthly plans
    const today = new Date().toISOString();
    const currentCount = validation.license?.tradesUsedToday || 0;
    const newCount = currentCount + 1;

    const { error } = await supabase
      .from('forex_licenses')
      .update({
        trades_used_today: newCount,
        last_trade_date: today
      })
      .eq('license_key', licenseKey);

    if (error) {
      console.error('Failed to record trade:', error);
      return { success: false, tradesRemaining: validation.tradesRemaining, error: 'Failed to record trade' };
    }

    return {
      success: true,
      tradesRemaining: MONTHLY_TRADE_LIMIT - newCount
    };
  } catch (error) {
    console.error('Record trade error:', error);
    return { success: false, tradesRemaining: 0, error: 'Failed to record trade' };
  }
}

// ============================================
// USER LICENSE MANAGEMENT
// ============================================

/**
 * Get license info for the current user
 */
export async function getUserForexLicense(): Promise<ForexLicense | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: license, error } = await supabase
      .from('forex_licenses')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !license) {
      return null;
    }

    return mapLicenseFromDb(license);
  } catch (error) {
    console.error('Get user license error:', error);
    return null;
  }
}

/**
 * Get all licenses for the current user (including expired)
 */
export async function getUserForexLicenses(): Promise<ForexLicense[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: licenses, error } = await supabase
      .from('forex_licenses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !licenses) {
      return [];
    }

    return licenses.map(mapLicenseFromDb);
  } catch (error) {
    console.error('Get user licenses error:', error);
    return [];
  }
}

/**
 * Create a new forex license for the current user (called after successful payment)
 */
export async function createForexLicense(
  planType: 'monthly' | 'lifetime',
  paymentId?: string
): Promise<{ success: boolean; license?: ForexLicense; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const licenseKey = generateForexLicenseKey(user.id, planType);
    const now = new Date();

    // Monthly licenses expire in 30 days
    const expiresAt = planType === 'monthly'
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data: license, error } = await supabase
      .from('forex_licenses')
      .insert({
        user_id: user.id,
        license_key: licenseKey,
        plan_type: planType,
        status: 'active',
        trades_used_today: 0,
        last_trade_date: null,
        expires_at: expiresAt,
        payment_id: paymentId,
        payment_status: 'completed',
        amount_paid: FOREX_PRICING[planType].price,
        currency: 'USD'
      })
      .select()
      .single();

    if (error) {
      console.error('Create license error:', error);
      return { success: false, error: 'Failed to create license' };
    }

    return {
      success: true,
      license: mapLicenseFromDb(license)
    };
  } catch (error) {
    console.error('Create license error:', error);
    return { success: false, error: 'Failed to create license' };
  }
}

/**
 * Renew a monthly license (extend by 30 days)
 */
export async function renewForexLicense(licenseKey: string): Promise<{
  success: boolean;
  newExpiresAt?: string;
  error?: string;
}> {
  try {
    const { data: license, error: fetchError } = await supabase
      .from('forex_licenses')
      .select('*')
      .eq('license_key', licenseKey)
      .single();

    if (fetchError || !license) {
      return { success: false, error: 'License not found' };
    }

    if (license.plan_type !== 'monthly') {
      return { success: false, error: 'Only monthly licenses can be renewed' };
    }

    // Calculate new expiration (from current expiry or now, whichever is later)
    const currentExpiry = license.expires_at ? new Date(license.expires_at) : new Date();
    const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
    const newExpiresAt = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('forex_licenses')
      .update({
        expires_at: newExpiresAt,
        status: 'active'
      })
      .eq('license_key', licenseKey);

    if (updateError) {
      return { success: false, error: 'Failed to renew license' };
    }

    return { success: true, newExpiresAt };
  } catch (error) {
    console.error('Renew license error:', error);
    return { success: false, error: 'Failed to renew license' };
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Map database record to ForexLicense interface
 */
function mapLicenseFromDb(dbRecord: any): ForexLicense {
  return {
    id: dbRecord.id,
    userId: dbRecord.user_id,
    licenseKey: dbRecord.license_key,
    planType: dbRecord.plan_type,
    status: dbRecord.status,
    tradesUsedToday: dbRecord.trades_used_today || 0,
    lastTradeDate: dbRecord.last_trade_date,
    createdAt: dbRecord.created_at,
    expiresAt: dbRecord.expires_at,
    paymentId: dbRecord.payment_id,
    paymentStatus: dbRecord.payment_status
  };
}

/**
 * Get remaining trades for today (for display purposes)
 */
export async function getRemainingTrades(licenseKey: string): Promise<number | null> {
  const validation = await validateForexLicense(licenseKey);
  return validation.tradesRemaining;
}

/**
 * Check if user has an active forex license
 */
export async function hasActiveForexLicense(): Promise<boolean> {
  const license = await getUserForexLicense();
  return license !== null && license.status === 'active';
}

/**
 * Get days until license expires (for monthly plans)
 */
export function getDaysUntilExpiry(license: ForexLicense): number | null {
  if (license.planType === 'lifetime' || !license.expiresAt) {
    return null; // Lifetime never expires
  }

  const now = new Date();
  const expiry = new Date(license.expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}
