// Validate Forex License Edge Function
// Called by MT5 EA to verify license validity before trading

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MONTHLY_TRADE_LIMIT = 5

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const { licenseKey } = await req.json()

    if (!licenseKey) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'License key is required',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up the license
    const { data: license, error: fetchError } = await supabase
      .from('forex_licenses')
      .select('*')
      .eq('license_key', licenseKey)
      .single()

    if (fetchError || !license) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'License not found',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check license status
    if (license.status !== 'active') {
      return new Response(
        JSON.stringify({
          valid: false,
          error: `License is ${license.status}`,
          status: license.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check payment status
    if (license.payment_status !== 'completed') {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Payment not completed',
          paymentStatus: license.payment_status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check expiration for monthly plans
    if (license.plan_type === 'monthly' && license.expires_at) {
      const expiresAt = new Date(license.expires_at)
      if (expiresAt < new Date()) {
        // Update license status to expired
        await supabase
          .from('forex_licenses')
          .update({ status: 'expired' })
          .eq('id', license.id)

        return new Response(
          JSON.stringify({
            valid: false,
            error: 'License has expired',
            expiredAt: license.expires_at,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Check daily trade limit for monthly plans
    let tradesRemaining = -1 // -1 means unlimited
    let canTrade = true

    if (license.plan_type === 'monthly') {
      const today = new Date().toISOString().split('T')[0]
      const lastTradeDate = license.last_trade_date
        ? new Date(license.last_trade_date).toISOString().split('T')[0]
        : null

      // Reset counter if it's a new day
      if (lastTradeDate !== today) {
        tradesRemaining = MONTHLY_TRADE_LIMIT
      } else {
        tradesRemaining = Math.max(0, MONTHLY_TRADE_LIMIT - (license.trades_used_today || 0))
      }

      canTrade = tradesRemaining > 0
    }

    return new Response(
      JSON.stringify({
        valid: true,
        canTrade,
        license: {
          id: license.id,
          planType: license.plan_type,
          status: license.status,
          expiresAt: license.expires_at,
          tradesUsedToday: license.trades_used_today || 0,
          tradesRemaining,
          tradeLimit: license.plan_type === 'monthly' ? MONTHLY_TRADE_LIMIT : -1,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('License validation error:', error)
    return new Response(
      JSON.stringify({
        valid: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
