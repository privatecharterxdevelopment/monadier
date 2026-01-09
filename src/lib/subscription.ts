// Subscription Plans Configuration

export type PlanTier = 'free' | 'starter' | 'pro' | 'elite' | 'desktop';
export type BillingCycle = 'monthly' | 'yearly' | 'lifetime';

export interface PlanFeatures {
  dailyTradeLimit: number; // -1 = unlimited
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
  paperTrading: boolean; // simulated trading only
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
    name: 'Free',
    description: 'Try before you buy - paper trading only',
    monthlyPrice: 0,
    yearlyPrice: 0,
    lifetimePrice: 0,
    yearlyDiscount: 0,
    features: {
      dailyTradeLimit: 5,
      maxActiveStrategies: 1,
      strategies: ['spot'],
      chains: [8453, 137], // Base, Polygon (cheap gas chains)
      autoTrading: false,
      arbitrage: false,
      customStrategies: false,
      prioritySupport: false,
      apiAccess: false,
      webhooks: false,
      multiWallet: false,
      maxWallets: 1,
      paperTrading: true, // FREE = paper trading only
      performanceAnalytics: false,
      whiteLabel: false
    }
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Real trading for beginners',
    monthlyPrice: 29,
    yearlyPrice: 290, // ~17% off ($348 -> $290)
    lifetimePrice: 299, // ~10 months
    yearlyDiscount: 17,
    features: {
      dailyTradeLimit: 25,
      maxActiveStrategies: 2,
      strategies: ['spot', 'dca'],
      chains: [1, 56, 42161, 8453, 137], // All chains
      autoTrading: false,
      arbitrage: false,
      customStrategies: false,
      prioritySupport: false,
      apiAccess: false,
      webhooks: false,
      multiWallet: true,
      maxWallets: 3,
      paperTrading: false,
      performanceAnalytics: false,
      whiteLabel: false
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For active traders who want automation',
    monthlyPrice: 79,
    yearlyPrice: 790, // ~17% off ($948 -> $790)
    lifetimePrice: 799, // Save $149/year vs monthly
    yearlyDiscount: 17,
    popular: true,
    badge: 'Most Popular',
    features: {
      dailyTradeLimit: 100,
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
      paperTrading: false,
      performanceAnalytics: true,
      whiteLabel: false
    }
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    description: 'Full power for professional traders',
    monthlyPrice: 199,
    yearlyPrice: 1990, // ~17% off ($2388 -> $1990)
    lifetimePrice: 1999, // Save $389/year vs monthly
    yearlyDiscount: 17,
    features: {
      dailyTradeLimit: -1, // unlimited
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
      paperTrading: false,
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
      paperTrading: false,
      performanceAnalytics: true,
      whiteLabel: false
    }
  }
};

// Pricing comparison data for UI
export const PRICING_TABLE = {
  columns: ['Plan', 'Monthly', 'Yearly', 'Lifetime', 'Trades/Day'],
  rows: [
    { plan: 'Free', monthly: '$0', yearly: '$0', lifetime: '-', trades: '5 (paper only)' },
    { plan: 'Starter', monthly: '$29', yearly: '$290', lifetime: '$299', trades: '25' },
    { plan: 'Pro', monthly: '$79', yearly: '$790', lifetime: '$799', trades: '100', popular: true },
    { plan: 'Elite', monthly: '$199', yearly: '$1,990', lifetime: '$1,999', trades: 'Unlimited' },
    { plan: 'Desktop', monthly: '-', yearly: '-', lifetime: '$499', trades: 'Unlimited', bestValue: true }
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
  isPaperTrading?: boolean;
}

// Check if user can make a trade
export function canMakeTrade(subscription: UserSubscription): { allowed: boolean; reason?: string; isPaperOnly?: boolean } {
  const plan = SUBSCRIPTION_PLANS[subscription.planTier];

  // Free tier = paper trading only
  if (subscription.planTier === 'free') {
    // Check daily limit for free tier
    if (subscription.dailyTradesUsed >= plan.features.dailyTradeLimit) {
      return {
        allowed: false,
        reason: `Daily trade limit reached (${plan.features.dailyTradeLimit} trades/day). Upgrade to Starter for more trades.`,
        isPaperOnly: true
      };
    }
    return { allowed: true, isPaperOnly: true };
  }

  // Check if subscription is active
  if (subscription.status !== 'active') {
    return { allowed: false, reason: 'Subscription is not active' };
  }

  // Check if subscription has expired (except lifetime)
  if (subscription.billingCycle !== 'lifetime' && new Date() > subscription.endDate) {
    return { allowed: false, reason: 'Subscription has expired' };
  }

  // Check daily trade limit
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
        reason: `Daily trade limit reached (${plan.features.dailyTradeLimit} trades/day). Upgrade to increase limit.`
      };
    }
  }

  return { allowed: true, isPaperOnly: false };
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
        reason: 'Upgrade to Starter for real trading with 25 trades/day - only $29/month!'
      };
    case 'starter':
      return {
        nextTier: 'pro',
        reason: 'Upgrade to Pro for Grid trading, Auto-trade, and 100 trades/day'
      };
    case 'pro':
      return {
        nextTier: 'elite',
        reason: 'Upgrade to Elite for Arbitrage, Custom strategies, and unlimited trades'
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
export function createFreeSubscription(walletAddress: string): UserSubscription {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setFullYear(endDate.getFullYear() + 100); // Effectively never expires

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
    isPaperTrading: true
  };
}
