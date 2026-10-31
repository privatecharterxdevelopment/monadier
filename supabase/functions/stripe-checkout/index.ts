import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import {
  stripe,
  PlanTier,
  BillingCycle,
  getStripePriceId,
  isRecurring,
  STRIPE_PRICE_IDS,
} from '../_shared/stripe.ts';
import { createSupabaseAdmin, getUserFromToken } from '../_shared/supabase.ts';

interface CheckoutRequest {
  planTier: PlanTier;
  billingCycle: BillingCycle;
  walletAddress?: string;
  successUrl?: string;
  cancelUrl?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user from token
    const user = await getUserFromToken(authHeader);

    // Parse request body
    const body: CheckoutRequest = await req.json();
    const { planTier, billingCycle, walletAddress, successUrl, cancelUrl } = body;

    // Validate plan tier
    if (!planTier || planTier === 'free') {
      return new Response(JSON.stringify({ error: 'Invalid plan tier' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate billing cycle
    if (!billingCycle || !['monthly', 'yearly', 'lifetime'].includes(billingCycle)) {
      return new Response(JSON.stringify({ error: 'Invalid billing cycle' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Desktop only supports lifetime
    if (planTier === 'desktop' && billingCycle !== 'lifetime') {
      return new Response(JSON.stringify({ error: 'Desktop license is lifetime only' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Stripe price ID
    const priceId = getStripePriceId(planTier, billingCycle);
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Price not configured for this plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase admin client
    const supabase = createSupabaseAdmin();

    // Check if user already has a Stripe customer ID
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId = existingSubscription?.stripe_customer_id;

    // Create or retrieve Stripe customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
          wallet_address: walletAddress || '',
        },
      });
      customerId = customer.id;
    } else {
      // Update customer metadata if wallet address provided
      if (walletAddress) {
        await stripe.customers.update(customerId, {
          metadata: {
            supabase_user_id: user.id,
            wallet_address: walletAddress,
          },
        });
      }
    }

    // Determine checkout mode based on billing cycle
    const mode = isRecurring(billingCycle) ? 'subscription' : 'payment';

    // Build line items
    const lineItems = [
      {
        price: priceId,
        quantity: 1,
      },
    ];

    // Create Stripe Checkout Session
    const sessionParams: any = {
      customer: customerId,
      mode,
      line_items: lineItems,
      success_url: successUrl || `${Deno.env.get('FRONTEND_URL')}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${Deno.env.get('FRONTEND_URL')}/pricing?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        plan_tier: planTier,
        billing_cycle: billingCycle,
        wallet_address: walletAddress || '',
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    };

    // Add subscription-specific options
    if (mode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: {
          supabase_user_id: user.id,
          plan_tier: planTier,
          billing_cycle: billingCycle,
        },
      };
    }

    // Add payment intent data for one-time payments
    if (mode === 'payment') {
      sessionParams.payment_intent_data = {
        metadata: {
          supabase_user_id: user.id,
          plan_tier: planTier,
          billing_cycle: billingCycle,
          wallet_address: walletAddress || '',
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Return the session URL
    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Checkout error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
