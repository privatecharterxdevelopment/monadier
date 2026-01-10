import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradeRequest {
  walletAddress: string;
  chainId: number;
  tokenAddress: string;
  amountIn: string;
  direction: 'LONG' | 'SHORT';
}

interface TradePermission {
  allowed: boolean;
  reason?: string;
  dailyTradesRemaining: number;
  planTier: string;
}

// Subscription tier limits
const SUBSCRIPTION_LIMITS: Record<string, { dailyTrades: number; realTrading: boolean }> = {
  free: { dailyTrades: 5, realTrading: false },
  starter: { dailyTrades: 25, realTrading: true },
  pro: { dailyTrades: 100, realTrading: true },
  elite: { dailyTrades: -1, realTrading: true },
  desktop: { dailyTrades: -1, realTrading: true },
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify bot service authorization
    const authHeader = req.headers.get('Authorization');
    const botApiKey = Deno.env.get('BOT_SERVICE_API_KEY');

    if (!authHeader || authHeader !== `Bearer ${botApiKey}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: TradeRequest = await req.json();
    const { walletAddress, chainId, tokenAddress, amountIn, direction } = body;

    if (!walletAddress || !chainId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (subError || !subscription) {
      const permission: TradePermission = {
        allowed: false,
        reason: 'No active subscription found',
        dailyTradesRemaining: 0,
        planTier: 'none',
      };
      return new Response(
        JSON.stringify(permission),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if subscription is active
    if (subscription.status !== 'active') {
      const permission: TradePermission = {
        allowed: false,
        reason: `Subscription is ${subscription.status}`,
        dailyTradesRemaining: 0,
        planTier: subscription.plan_tier,
      };
      return new Response(
        JSON.stringify(permission),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if subscription is expired
    const now = new Date();
    const endDate = new Date(subscription.end_date);
    if (now > endDate) {
      const permission: TradePermission = {
        allowed: false,
        reason: 'Subscription has expired',
        dailyTradesRemaining: 0,
        planTier: subscription.plan_tier,
      };
      return new Response(
        JSON.stringify(permission),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Free tier cannot use auto-trading
    if (subscription.plan_tier === 'free') {
      const permission: TradePermission = {
        allowed: false,
        reason: 'Free tier does not have access to auto-trading',
        dailyTradesRemaining: 0,
        planTier: subscription.plan_tier,
      };
      return new Response(
        JSON.stringify(permission),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get limits for this tier
    const limits = SUBSCRIPTION_LIMITS[subscription.plan_tier];
    if (!limits) {
      const permission: TradePermission = {
        allowed: false,
        reason: 'Invalid subscription tier',
        dailyTradesRemaining: 0,
        planTier: subscription.plan_tier,
      };
      return new Response(
        JSON.stringify(permission),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if daily trades need reset
    const dailyResetAt = new Date(subscription.daily_trades_reset_at);
    let dailyTradesUsed = subscription.daily_trades_used;

    if (now > dailyResetAt) {
      // Reset daily trades
      const tomorrow = new Date();
      tomorrow.setUTCHours(0, 0, 0, 0);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

      await supabase
        .from('subscriptions')
        .update({
          daily_trades_used: 0,
          daily_trades_reset_at: tomorrow.toISOString(),
        })
        .eq('user_id', subscription.user_id);

      dailyTradesUsed = 0;
    }

    // Calculate remaining trades
    const dailyLimit = limits.dailyTrades;
    const dailyTradesRemaining = dailyLimit === -1
      ? -1 // Unlimited
      : Math.max(0, dailyLimit - dailyTradesUsed);

    // Check daily limit
    if (dailyLimit !== -1 && dailyTradesRemaining <= 0) {
      const permission: TradePermission = {
        allowed: false,
        reason: 'Daily trade limit reached',
        dailyTradesRemaining: 0,
        planTier: subscription.plan_tier,
      };
      return new Response(
        JSON.stringify(permission),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All checks passed - allow trade
    const permission: TradePermission = {
      allowed: true,
      dailyTradesRemaining,
      planTier: subscription.plan_tier,
    };

    // Log the trade request
    await supabase.from('trade_logs').insert({
      wallet_address: walletAddress.toLowerCase(),
      chain_id: chainId,
      token_address: tokenAddress,
      amount_in: amountIn,
      direction,
      status: 'authorized',
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify(permission),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in verify-bot-trade:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

