// Forex Checkout Edge Function
// Creates a Stripe checkout session for forex MT5 plans

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Forex pricing
const FOREX_PRICES = {
  'forex-monthly': {
    amount: 2900, // $29.00 in cents
    currency: 'usd',
    name: 'Forex MT5 Bot - Monthly',
    description: 'Monthly subscription with 5 trades/day limit',
    interval: 'month' as const,
    planType: 'monthly' as const,
  },
  'forex-lifetime': {
    amount: 19900, // $199.00 in cents
    currency: 'usd',
    name: 'Forex MT5 Bot - Lifetime',
    description: 'One-time purchase with unlimited trades',
    interval: null,
    planType: 'lifetime' as const,
  },
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get auth token from header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { planType, successUrl, cancelUrl } = await req.json()

    // Validate plan type
    if (!planType || !FOREX_PRICES[planType as keyof typeof FOREX_PRICES]) {
      return new Response(
        JSON.stringify({ error: 'Invalid plan type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const plan = FOREX_PRICES[planType as keyof typeof FOREX_PRICES]

    // Check if user already has an active license
    const { data: existingLicense } = await supabase
      .from('forex_licenses')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (existingLicense) {
      // If they have lifetime, don't allow purchase
      if (existingLicense.plan_type === 'lifetime') {
        return new Response(
          JSON.stringify({ error: 'You already have a lifetime license' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // If they have monthly and want lifetime, allow upgrade
      // If they have monthly and want monthly, allow renewal
    }

    // Get or create Stripe customer
    let customerId: string

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      })
      customerId = customer.id

      // Save customer ID to profile
      await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
    }

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      payment_method_types: ['card'],
      mode: plan.interval ? 'subscription' : 'payment',
      success_url: successUrl || `${req.headers.get('origin')}/dashboard/downloads?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.get('origin')}/forex?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan_type: plan.planType,
        product: 'forex-mt5',
      },
      line_items: [
        {
          price_data: {
            currency: plan.currency,
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.amount,
            ...(plan.interval && {
              recurring: {
                interval: plan.interval,
              },
            }),
          },
          quantity: 1,
        },
      ],
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    // Create pending license record
    const licenseKey = generateLicenseKey(user.id, plan.planType)

    await supabase
      .from('forex_licenses')
      .insert({
        user_id: user.id,
        license_key: licenseKey,
        plan_type: plan.planType,
        status: 'pending',
        payment_status: 'pending',
        payment_id: session.id,
        payment_provider: 'stripe',
        amount_paid: plan.amount / 100,
        currency: plan.currency.toUpperCase(),
      })

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Checkout error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Generate license key
function generateLicenseKey(userId: string, planType: 'monthly' | 'lifetime'): string {
  const prefix = planType === 'lifetime' ? 'FX-LT' : 'FX-MO'
  const userPart = userId.replace(/-/g, '').substring(0, 8).toUpperCase()
  const timestamp = Date.now().toString(36).toUpperCase().substring(0, 6)
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${userPart}-${timestamp}-${random}`
}
