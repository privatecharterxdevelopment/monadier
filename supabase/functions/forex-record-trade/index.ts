// Forex Record Trade Edge Function
// Called by MT5 EA to record a trade and check limits

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
    const { licenseKey, tradeType, symbol, volume, price } = await req.json()

    if (!licenseKey) {
      return new Response(
        JSON.stringify({
          success: false,
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
          success: false,
          error: 'License not found',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate license is active
    if (license.status !== 'active') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `License is ${license.status}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check payment status
    if (license.payment_status !== 'completed') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Payment not completed',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check expiration for monthly plans
    if (license.plan_type === 'monthly' && license.expires_at) {
      const expiresAt = new Date(license.expires_at)
      if (expiresAt < new Date()) {
        await supabase
          .from('forex_licenses')
          .update({ status: 'expired' })
          .eq('id', license.id)

        return new Response(
          JSON.stringify({
            success: false,
            error: 'License has expired',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const lastTradeDate = license.last_trade_date
      ? new Date(license.last_trade_date).toISOString().split('T')[0]
      : null

    // Calculate current trade count
    let currentTradeCount = license.trades_used_today || 0

    // Reset if new day
    if (lastTradeDate !== today) {
      currentTradeCount = 0
    }

    // Check trade limit for monthly plans
    if (license.plan_type === 'monthly') {
      if (currentTradeCount >= MONTHLY_TRADE_LIMIT) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Daily trade limit reached',
            tradesUsedToday: currentTradeCount,
            tradeLimit: MONTHLY_TRADE_LIMIT,
            tradesRemaining: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Increment trade count
    const newTradeCount = currentTradeCount + 1

    // Update license with new trade count
    const { error: updateError } = await supabase
      .from('forex_licenses')
      .update({
        trades_used_today: newTradeCount,
        last_trade_date: now.toISOString(),
      })
      .eq('id', license.id)

    if (updateError) {
      console.error('Failed to update trade count:', updateError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to record trade',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Optionally log the trade (for analytics)
    // You can create a forex_trades table to store trade history
    if (tradeType && symbol) {
      await supabase
        .from('forex_trades')
        .insert({
          license_id: license.id,
          user_id: license.user_id,
          trade_type: tradeType,
          symbol: symbol,
          volume: volume || null,
          price: price || null,
          traded_at: now.toISOString(),
        })
        .catch(() => {
          // Ignore if forex_trades table doesn't exist
        })
    }

    // Calculate remaining trades
    const tradesRemaining = license.plan_type === 'monthly'
      ? Math.max(0, MONTHLY_TRADE_LIMIT - newTradeCount)
      : -1 // -1 means unlimited

    return new Response(
      JSON.stringify({
        success: true,
        tradeRecorded: true,
        tradesUsedToday: newTradeCount,
        tradesRemaining,
        tradeLimit: license.plan_type === 'monthly' ? MONTHLY_TRADE_LIMIT : -1,
        message: license.plan_type === 'monthly'
          ? `Trade recorded. ${tradesRemaining} trades remaining today.`
          : 'Trade recorded. Unlimited trades available.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Record trade error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
