// Forex Payment Status Edge Function
// Verifies payment status and activates license after successful payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { sessionId } = await req.json()

    // If sessionId provided, check that specific session
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId)

      if (!session) {
        return new Response(
          JSON.stringify({ status: 'not_found', message: 'Session not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify this session belongs to this user
      if (session.metadata?.user_id !== user.id) {
        return new Response(
          JSON.stringify({ status: 'failed', message: 'Session does not belong to this user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check payment status
      if (session.payment_status === 'paid') {
        // Activate the license
        const license = await activateLicense(supabase, sessionId, user.id)

        return new Response(
          JSON.stringify({
            status: 'completed',
            license: {
              id: license.id,
              licenseKey: license.license_key,
              planType: license.plan_type,
              status: license.status,
              expiresAt: license.expires_at,
            },
            message: 'Payment successful! Your license is now active.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else if (session.payment_status === 'unpaid') {
        return new Response(
          JSON.stringify({
            status: 'pending',
            message: 'Payment is still pending. Please complete your purchase.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        // Mark as failed
        await supabase
          .from('forex_licenses')
          .update({
            payment_status: 'failed',
            status: 'cancelled',
          })
          .eq('payment_id', sessionId)

        return new Response(
          JSON.stringify({
            status: 'failed',
            message: 'Payment failed. Please try again.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // If no sessionId, check for user's most recent pending license
    const { data: pendingLicense } = await supabase
      .from('forex_licenses')
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!pendingLicense) {
      // Check for active license
      const { data: activeLicense } = await supabase
        .from('forex_licenses')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (activeLicense) {
        return new Response(
          JSON.stringify({
            status: 'completed',
            license: {
              id: activeLicense.id,
              licenseKey: activeLicense.license_key,
              planType: activeLicense.plan_type,
              status: activeLicense.status,
              expiresAt: activeLicense.expires_at,
            },
            message: 'You have an active license.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          status: 'not_found',
          message: 'No pending payment found.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check the pending license's payment status
    if (pendingLicense.payment_id) {
      const session = await stripe.checkout.sessions.retrieve(pendingLicense.payment_id)

      if (session.payment_status === 'paid') {
        const license = await activateLicense(supabase, pendingLicense.payment_id, user.id)

        return new Response(
          JSON.stringify({
            status: 'completed',
            license: {
              id: license.id,
              licenseKey: license.license_key,
              planType: license.plan_type,
              status: license.status,
              expiresAt: license.expires_at,
            },
            message: 'Payment successful! Your license is now active.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({
        status: 'pending',
        message: 'Payment is still pending.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Payment status error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Activate license after successful payment
async function activateLicense(supabase: any, paymentId: string, userId: string) {
  // Get the pending license
  const { data: license, error: fetchError } = await supabase
    .from('forex_licenses')
    .select('*')
    .eq('payment_id', paymentId)
    .single()

  if (fetchError || !license) {
    throw new Error('License not found')
  }

  // Already activated?
  if (license.status === 'active' && license.payment_status === 'completed') {
    return license
  }

  // Calculate expiration for monthly plans
  const now = new Date()
  const expiresAt = license.plan_type === 'monthly'
    ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null

  // Update license to active
  const { data: updatedLicense, error: updateError } = await supabase
    .from('forex_licenses')
    .update({
      status: 'active',
      payment_status: 'completed',
      expires_at: expiresAt,
      trades_used_today: 0,
    })
    .eq('id', license.id)
    .select()
    .single()

  if (updateError) {
    throw new Error('Failed to activate license')
  }

  // Deactivate any previous licenses for this user
  await supabase
    .from('forex_licenses')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .neq('id', license.id)
    .eq('status', 'active')

  return updatedLicense
}
