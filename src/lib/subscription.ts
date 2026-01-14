// Subscription Plans Configuration

export type PlanTier = 'free' | 'starter' | 'pro' | 'elite' | 'desktop';
export type BillingCycle = 'monthly' | 'yearly' | 'lifetime';

export interface PlanFeatures {
  dailyTradeLimit: number; // -1 = unlimited
  totalTradeLimit: number; // For free tier: total lifetime trades, -1 = unlimited
  maxActiveStrategies: number;
  strategies: string[];
  chains: number[]; // chain IDs allowed
  autoTrading: boolean;
  arbitrage: boolean;
  customStrategies: boolean;
  prioritySupport: boolean;
  apiAccess: boolean;
  webhooks: boolean;
  multiWallet: boolean;
  maxWallets: number;
  performanceAnalytics: boolean;
  whiteLabel: boolean;
}

export interface SubscriptionPlan {
  id: PlanTier;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  lifetimePrice: number;
  yearlyDiscount: number; // percentage saved
  features: PlanFeatures;
  popular?: boolean;
  bestValue?: boolean;
  badge?: string;
}

// NEW COMPETITIVE PRICING - Updated January 2026
// Competitor Analysis: 3Commas ($29-159), Cryptohopper ($19-99), Pionex (FREE), TradeSanta ($15-70)

export const SUBSCRIPTION_PLANS: Record<PlanTier, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free Trial',
    description: 'Try 2 real trades for free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    lifetimePrice: 0,
    yearlyDiscount: 0,
    features: {
      dailyTradeLimit: -1, // No daily limit
      totalTradeLimit: 2, // 2 trades total, then subscription required
      maxActiveStrategies: 1,
      strategies: ['spot'],
      chains: [8453], // Base only (cheap gas)
      autoTrading: true, // Allow bot trading in free trial
      arbitrage: false,
      customStrategies: false,
      prioritySupport: false,
      apiAccess: false,
      webhooks: false,
      multiWallet: false,
      maxWallets: 1,
      performanceAnalytics: false,
      whiteLabel: false
    }
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Real trading for beginners',
    monthlyPrice: 9,
    yearlyPrice: 74, // Save $34/year (31% off)
    lifetimePrice: 99,
    yearlyDiscount: 31,
    features: {
      dailyTradeLimit: 25,
      totalTradeLimit: -1, // Unlimited total
      maxActiveStrategies: 2,
      strategies: ['spot', 'dca'],
      chains: [1, 56, 42161, 8453, 137], // All chains
      autoTrading: true,
      arbitrage: false,
      customStrategies: false,
      prioritySupport: false,
      apiAccess: false,
      webhooks: false,
      multiWallet: true,
      maxWallets: 3,
      performanceAnalytics: false,
      whiteLabel: false
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For active traders who want automation',
    monthlyPrice: 29,
    yearlyPrice: 240, // Save $108/year (31% off)
    lifetimePrice: 299,
    yearlyDiscount: 31,
    popular: true,
    badge: 'Most Popular',
    features: {
      dailyTradeLimit: 100,
      totalTradeLimit: -1, // Unlimited total
      maxActiveStrategies: 5,
      strategies: ['spot', 'grid', 'dca'],
      chains: [1, 56, 42161, 8453, 137], // All EVM chains
      autoTrading: true,
      arbitrage: false,
      customStrategies: false,
      prioritySupport: true,
      apiAccess: false,
      webhooks: false,
      multiWallet: true,
      maxWallets: 10,
      performanceAnalytics: true,
      whiteLabel: false
    }
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    description: 'Full power for professional traders',
    monthlyPrice: 49,
    yearlyPrice: 406, // Save $182/year (31% off)
    lifetimePrice: 499,
    yearlyDiscount: 31,
    features: {
      dailyTradeLimit: -1, // unlimited
      totalTradeLimit: -1, // Unlimited total
      maxActiveStrategies: -1, // unlimited
      strategies: ['spot', 'grid', 'dca', 'arbitrage', 'custom'],
      chains: [1, 56, 42161, 8453, 137], // All chains
      autoTrading: true,
      arbitrage: true,
      customStrategies: true,
      prioritySupport: true,
      apiAccess: true,
      webhooks: true,
      multiWallet: true,
      maxWallets: -1, // unlimited
      performanceAnalytics: true,
      whiteLabel: true
    }
  },
  desktop: {
    id: 'desktop',
    name: 'Desktop',
    description: 'One-time purchase - run locally forever',
    monthlyPrice: 0, // No monthly option
    yearlyPrice: 0, // No yearly option
    lifetimePrice: 499, // ONE-TIME LIFETIME LICENSE
    yearlyDiscount: 0,
    bestValue: true,
    badge: 'Best Value',
    features: {
      dailyTradeLimit: -1, // unlimited
      totalTradeLimit: -1, // Unlimited total
      maxActiveStrategies: -1, // unlimited
      strategies: ['spot', 'grid', 'dca', 'arbitrage', 'custom'],
      chains: [1, 56, 42161, 8453, 137],
      autoTrading: true,
      arbitrage: true,
      customStrategies: true,
      prioritySupport: true,
      apiAccess: true,
      webhooks: true,
      multiWallet: true,
      maxWallets: -1, // unlimited
      performanceAnalytics: true,
      whiteLabel: false
    }
  }
};

// Pricing comparison data for UI
export const PRICING_TABLE = {
  columns: ['Plan', 'Monthly', 'Yearly', 'Lifetime', 'Trades'],
  rows: [
    { plan: 'Free Trial', monthly: '$0', yearly: '-', lifetime: '-', trades: '2 total' },
    { plan: 'Starter', monthly: '$9', yearly: '$74', lifetime: '$99', trades: '25/day' },
    { plan: 'Pro', monthly: '$29', yearly: '$240', lifetime: '$299', trades: '100/day', popular: true },
    { plan: 'Elite', monthly: '$49', yearly: '$406', lifetime: '$499', trades: 'Unlimited' }
  ]
};

// License Code Generator
export interface LicenseCode {
  code: string;
  planTier: PlanTier;
  createdAt: Date;
  expiresAt: Date;
  activatedAt?: Date;
  activatedBy?: string; // wallet address
  isActive: boolean;
  machineId?: string; // for desktop licenses
  isLifetime?: boolean;
}

// Generate a unique license code
export function generateLicenseCode(planTier: PlanTier, billingCycle: BillingCycle = 'monthly'): string {
  const prefix: Record<PlanTier, string> = {
    free: 'FRE',
    starter: 'STR',
    pro: 'PRO',
    elite: 'ELT',
    desktop: 'DSK'
  };

  // Generate random segments
  const segment1 = generateRandomSegment(4);
  const segment2 = generateRandomSegment(4);
  const segment3 = generateRandomSegment(4);
  const segment4 = generateRandomSegment(4);

  // Add checksum for validation
  const checksum = generateChecksum(`${prefix[planTier]}-${segment1}-${segment2}-${segment3}-${segment4}`);

  return `${prefix[planTier]}-${segment1}-${segment2}-${segment3}-${segment4}-${checksum}`;
}

function generateRandomSegment(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded I, O, 0, 1 to avoid confusion
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateChecksum(code: string): string {
  // Simple checksum: sum of char codes mod 36, converted to base36
  let sum = 0;
  for (const char of code.replace(/-/g, '')) {
    sum += char.charCodeAt(0);
  }
  return (sum % 1000).toString().padStart(3, '0');
}

// Validate license code format
export function validateLicenseFormat(code: string): { valid: boolean; planTier?: PlanTier; error?: string } {
  const pattern = /^(FRE|STR|PRO|ELT|DSK)-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-(\d{3})$/;
  const match = code.toUpperCase().match(pattern);

  if (!match) {
    return { valid: false, error: 'Invalid license code format' };
  }

  const [, prefix, seg1, seg2, seg3, seg4, checksum] = match;

  // Verify checksum
  const baseCode = `${prefix}-${seg1}-${seg2}-${seg3}-${seg4}`;
  const expectedChecksum = generateChecksum(baseCode);

  if (checksum !== expectedChecksum) {
    return { valid: false, error: 'Invalid license code checksum' };
  }

  const planTierMap: Record<string, PlanTier> = {
    'FRE': 'free',
    'STR': 'starter',
    'PRO': 'pro',
    'ELT': 'elite',
    'DSK': 'desktop'
  };

  return { valid: true, planTier: planTierMap[prefix] };
}

// Subscription state
export interface UserSubscription {
  id: string;
  userId: string;
  walletAddress: string;
  planTier: PlanTier;
  billingCycle: BillingCycle;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  licenseCode?: string;
  paymentMethod?: 'crypto' | 'stripe' | 'paypal';
  lastPaymentDate?: Date;
  nextPaymentDate?: Date;
  dailyTradesUsed: number;
  dailyTradesResetAt: Date;
  totalTradesUsed: number; // For free tier: lifetime trade count
  timezone: string; // User's timezone (e.g., 'America/New_York')
}

// Check if user can make a trade
export function canMakeTrade(subscription: UserSubscription): { allowed: boolean; reason?: string; remainingTrades?: number } {
  const plan = SUBSCRIPTION_PLANS[subscription.planTier];

  // Free tier = 2 total trades, then subscription required
  if (subscription.planTier === 'free') {
    const totalLimit = plan.features.totalTradeLimit;
    const totalUsed = subscription.totalTradesUsed || 0;

    if (totalUsed >= totalLimit) {
      return {
        allowed: false,
        reason: `Free trial ended. You've used your ${totalLimit} free trades. Subscribe to continue trading!`,
        remainingTrades: 0
      };
    }
    return { allowed: true, remainingTrades: totalLimit - totalUsed };
  }

  // Check if subscription is active
  if (subscription.status !== 'active') {
    return { allowed: false, reason: 'Subscription is not active' };
  }

  // Check if subscription has expired (except lifetime)
  if (subscription.billingCycle !== 'lifetime' && new Date() > subscription.endDate) {
    return { allowed: false, reason: 'Subscription has expired' };
  }

  // Check daily trade limit (for paid plans)
  if (plan.features.dailyTradeLimit !== -1) {
    // Reset daily trades if needed
    const now = new Date();
    if (now > subscription.dailyTradesResetAt) {
      subscription.dailyTradesUsed = 0;
      subscription.dailyTradesResetAt = new Date(now.setHours(24, 0, 0, 0));
    }

    if (subscription.dailyTradesUsed >= plan.features.dailyTradeLimit) {
      return {
        allowed: false,
        reason: `Daily trade limit reached (${plan.features.dailyTradeLimit} trades/day). Upgrade to increase limit.`,
        remainingTrades: 0
      };
    }

    return { allowed: true, remainingTrades: plan.features.dailyTradeLimit - subscription.dailyTradesUsed };
  }

  return { allowed: true, remainingTrades: -1 }; // -1 = unlimited
}

// Check if a feature is available for the plan
export function hasFeature(planTier: PlanTier, feature: keyof PlanFeatures): boolean {
  const plan = SUBSCRIPTION_PLANS[planTier];
  const value = plan.features[feature];

  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (Array.isArray(value)) return value.length > 0;

  return false;
}

// Check if strategy is allowed for plan
export function isStrategyAllowed(planTier: PlanTier, strategy: string): boolean {
  const plan = SUBSCRIPTION_PLANS[planTier];
  return plan.features.strategies.includes(strategy);
}

// Check if chain is allowed for plan
export function isChainAllowed(planTier: PlanTier, chainId: number): boolean {
  const plan = SUBSCRIPTION_PLANS[planTier];
  return plan.features.chains.includes(chainId);
}

// Calculate days remaining
export function getDaysRemaining(subscription: UserSubscription): number {
  // Lifetime subscriptions never expire
  if (subscription.billingCycle === 'lifetime') {
    return -1; // -1 = never expires
  }

  const now = new Date();
  const end = new Date(subscription.endDate);
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

// Get remaining daily trades
export function getRemainingDailyTrades(subscription: UserSubscription): number {
  const plan = SUBSCRIPTION_PLANS[subscription.planTier];

  if (plan.features.dailyTradeLimit === -1) {
    return -1; // unlimited
  }

  return Math.max(0, plan.features.dailyTradeLimit - subscription.dailyTradesUsed);
}

// Format price for display
export function formatPrice(amount: number, currency: string = 'USD'): string {
  if (amount === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Calculate savings for yearly/lifetime
export function calculateSavings(planTier: PlanTier, billingCycle: 'yearly' | 'lifetime'): number {
  const plan = SUBSCRIPTION_PLANS[planTier];

  if (billingCycle === 'yearly') {
    const monthlyTotal = plan.monthlyPrice * 12;
    return monthlyTotal - plan.yearlyPrice;
  }

  if (billingCycle === 'lifetime') {
    // Compare to 1 year of monthly
    const yearlyMonthly = plan.monthlyPrice * 12;
    return yearlyMonthly - plan.lifetimePrice;
  }

  return 0;
}

// Get upgrade recommendations
export function getUpgradeRecommendation(currentTier: PlanTier): { nextTier: PlanTier; reason: string } | null {
  switch (currentTier) {
    case 'free':
      return {
        nextTier: 'starter',
        reason: 'Upgrade to Starter for real trading with 25 trades/day - only $9/month!'
      };
    case 'starter':
      return {
        nextTier: 'pro',
        reason: 'Upgrade to Pro for 1-50x leverage, Grid trading, and 100 trades/day - $29/month'
      };
    case 'pro':
      return {
        nextTier: 'elite',
        reason: 'Upgrade to Elite for Arbitrage, Custom strategies, Phone support & unlimited trades'
      };
    case 'elite':
      return {
        nextTier: 'desktop',
        reason: 'Get Desktop for $499 one-time - no more recurring fees!'
      };
    default:
      return null;
  }
}

// Generate renewal reminder dates
export function getRenewalReminders(subscription: UserSubscription): Date[] {
  // Lifetime subscriptions don't need renewal reminders
  if (subscription.billingCycle === 'lifetime') {
    return [];
  }

  const endDate = new Date(subscription.endDate);
  const reminders: Date[] = [];

  // 30 days before
  const thirtyDays = new Date(endDate);
  thirtyDays.setDate(thirtyDays.getDate() - 30);
  if (thirtyDays > new Date()) reminders.push(thirtyDays);

  // 7 days before
  const sevenDays = new Date(endDate);
  sevenDays.setDate(sevenDays.getDate() - 7);
  if (sevenDays > new Date()) reminders.push(sevenDays);

  // 1 day before
  const oneDay = new Date(endDate);
  oneDay.setDate(oneDay.getDate() - 1);
  if (oneDay > new Date()) reminders.push(oneDay);

  return reminders;
}

// Desktop license specific functions
export interface DesktopLicense extends LicenseCode {
  machineId: string;
  machineFingerprint: string;
  lastHeartbeat: Date;
  offlineGracePeriodDays: number;
}

export function generateMachineFingerprint(): string {
  // In a real app, this would collect hardware info
  // For now, generate a unique ID based on browser/device info
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown'
  ];

  // Create hash of components
  let hash = 0;
  const str = components.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

// Validate desktop license activation
export function canActivateDesktopLicense(
  license: LicenseCode,
  currentMachineId: string
): { allowed: boolean; reason?: string } {
  if (license.planTier !== 'desktop') {
    return { allowed: false, reason: 'Not a desktop license' };
  }

  if (license.activatedAt && license.machineId && license.machineId !== currentMachineId) {
    return {
      allowed: false,
      reason: 'License already activated on another machine. Contact support to transfer.'
    };
  }

  // Desktop licenses are lifetime - no expiration check needed
  // (unless we want to add a "lifetime updates" expiry in the future)

  return { allowed: true };
}

// Create a free tier subscription for new users
export function createFreeSubscription(walletAddress: string, timezone?: string): UserSubscription {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setFullYear(endDate.getFullYear() + 100); // Effectively never expires

  // Get user's timezone from browser if not provided
  const userTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return {
    id: `free_${Date.now()}`,
    userId: `user_${Date.now()}`,
    walletAddress,
    planTier: 'free',
    billingCycle: 'lifetime', // Free tier is always "active"
    status: 'active',
    startDate: now,
    endDate,
    autoRenew: false,
    dailyTradesUsed: 0,
    dailyTradesResetAt: new Date(now.setHours(24, 0, 0, 0)),
    totalTradesUsed: 0, // Start with 0, max 2 for free tier
    timezone: userTimezone
  };
}

// Get user's browser timezone
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

// Format reset time for display in user's timezone
export function formatResetTime(resetAt: Date, timezone: string): string {
  try {
    return resetAt.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return resetAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
}

// Get common timezones for dropdown
export const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (NZST)' },
  { value: 'UTC', label: 'UTC' }
];
