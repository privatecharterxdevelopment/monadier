import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

// Initialize Stripe with the secret key from environment
export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Subscription plan configuration matching frontend
export type PlanTier = 'free' | 'starter' | 'pro' | 'elite' | 'desktop';
export type BillingCycle = 'monthly' | 'yearly' | 'lifetime';

export interface PlanPricing {
  monthlyPriceId: string | null;
  yearlyPriceId: string | null;
  lifetimePriceId: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  lifetimePrice: number;
}

// Stripe Price IDs - These need to be created in Stripe Dashboard
// Replace with your actual Stripe Price IDs after creating products
export const STRIPE_PRICE_IDS: Record<Exclude<PlanTier, 'free'>, PlanPricing> = {
  starter: {
    monthlyPriceId: Deno.env.get('STRIPE_STARTER_MONTHLY_PRICE_ID') || 'price_starter_monthly',
    yearlyPriceId: Deno.env.get('STRIPE_STARTER_YEARLY_PRICE_ID') || 'price_starter_yearly',
    lifetimePriceId: Deno.env.get('STRIPE_STARTER_LIFETIME_PRICE_ID') || 'price_starter_lifetime',
    monthlyPrice: 2900, // $29.00 in cents
    yearlyPrice: 29000, // $290.00 in cents
    lifetimePrice: 29900, // $299.00 in cents
  },
  pro: {
    monthlyPriceId: Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID') || 'price_pro_monthly',
    yearlyPriceId: Deno.env.get('STRIPE_PRO_YEARLY_PRICE_ID') || 'price_pro_yearly',
    lifetimePriceId: Deno.env.get('STRIPE_PRO_LIFETIME_PRICE_ID') || 'price_pro_lifetime',
    monthlyPrice: 7900, // $79.00 in cents
    yearlyPrice: 79000, // $790.00 in cents
    lifetimePrice: 79900, // $799.00 in cents
  },
  elite: {
    monthlyPriceId: Deno.env.get('STRIPE_ELITE_MONTHLY_PRICE_ID') || 'price_elite_monthly',
    yearlyPriceId: Deno.env.get('STRIPE_ELITE_YEARLY_PRICE_ID') || 'price_elite_yearly',
    lifetimePriceId: Deno.env.get('STRIPE_ELITE_LIFETIME_PRICE_ID') || 'price_elite_lifetime',
    monthlyPrice: 19900, // $199.00 in cents
    yearlyPrice: 199000, // $1,990.00 in cents
    lifetimePrice: 199900, // $1,999.00 in cents
  },
  desktop: {
    monthlyPriceId: null, // No monthly option
    yearlyPriceId: null, // No yearly option
    lifetimePriceId: Deno.env.get('STRIPE_DESKTOP_LIFETIME_PRICE_ID') || 'price_desktop_lifetime',
    monthlyPrice: 0,
    yearlyPrice: 0,
    lifetimePrice: 49900, // $499.00 in cents
  },
};

// Get the Stripe Price ID for a plan and billing cycle
export function getStripePriceId(planTier: PlanTier, billingCycle: BillingCycle): string | null {
  if (planTier === 'free') return null;

  const pricing = STRIPE_PRICE_IDS[planTier];

  switch (billingCycle) {
    case 'monthly':
      return pricing.monthlyPriceId;
    case 'yearly':
      return pricing.yearlyPriceId;
    case 'lifetime':
      return pricing.lifetimePriceId;
    default:
      return null;
  }
}

// Check if the billing cycle is a subscription (recurring) or one-time payment
export function isRecurring(billingCycle: BillingCycle): boolean {
  return billingCycle === 'monthly' || billingCycle === 'yearly';
}

// Get interval for Stripe subscription
export function getStripeInterval(billingCycle: BillingCycle): 'month' | 'year' | null {
  switch (billingCycle) {
    case 'monthly':
      return 'month';
    case 'yearly':
      return 'year';
    default:
      return null;
  }
}
