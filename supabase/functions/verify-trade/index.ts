import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromToken } from '../_shared/supabase.ts';

// Plan limits configuration
const PLAN_LIMITS: Record<string, { dailyTradeLimit: number; paperOnly: boolean; allowedChains: number[] }> = {
  free: {
    dailyTradeLimit: 5,
    paperOnly: true,
    allowedChains: [8453, 137] // Base, Polygon
  },
  starter: {
    dailyTradeLimit: 25,
    paperOnly: false,
    allowedChains: [1, 56, 42161, 8453, 137] // All chains
  },
  pro: {
    dailyTradeLimit: 100,
    paperOnly: false,
    allowedChains: [1, 56, 42161, 8453, 137]
  },
  elite: {
    dailyTradeLimit: -1, // unlimited
    paperOnly: false,
    allowedChains: [1, 56, 42161, 8453, 137]
  },
  desktop: {
    dailyTradeLimit: -1, // unlimited
    paperOnly: false,
    allowedChains: [1, 56, 42161, 8453, 137]
  }
};

interface VerifyTradeRequest {
  chainId: number;
  isPaperTrade?: boolean;
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
    const body: VerifyTradeRequest = await req.json();
    const { chainId, isPaperTrade = false } = body;

    // Initialize Supabase admin client
    const supabase = createSupabaseAdmin();

    // Get user's subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // If no subscription, treat as free tier
    const planTier = subscription?.plan_tier || 'free';
    const limits = PLAN_LIMITS[planTier] || PLAN_LIMITS.free;

    // Check if subscription is active
    if (subscription && subscription.status !== 'active') {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: 'Subscription is not active. Please renew your subscription.',
          planTier,
          isPaperOnly: true
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if subscription has expired (except lifetime/free)
    if (subscription && subscription.billing_cycle !== 'lifetime' && planTier !== 'free') {
      const endDate = new Date(subscription.end_date);
      if (new Date() > endDate) {
        // Mark as expired
        await supabase.from('subscriptions').update({
          status: 'expired',
          updated_at: new Date().toISOString()
        }).eq('id', subscription.id);

        return new Response(
          JSON.stringify({
            allowed: false,
            reason: 'Subscription has expired. Please renew to continue trading.',
            planTier,
            isPaperOnly: true
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Check chain restrictions
    if (!limits.allowedChains.includes(chainId)) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: `Chain not available on ${planTier} plan. Upgrade to access all chains.`,
          planTier,
          allowedChains: limits.allowedChains
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Free tier = paper trading only
    if (limits.paperOnly && !isPaperTrade) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: 'Free tier only supports paper trading. Upgrade to Starter for real trades.',
          planTier,
          isPaperOnly: true
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check daily trade limit
    if (limits.dailyTradeLimit !== -1) {
      let dailyTradesUsed = subscription?.daily_trades_used || 0;
      let dailyTradesResetAt = subscription?.daily_trades_reset_at
        ? new Date(subscription.daily_trades_reset_at)
        : new Date();

      // Reset daily trades if needed
      const now = new Date();
      if (now > dailyTradesResetAt) {
        dailyTradesUsed = 0;
        dailyTradesResetAt = new Date(now);
        dailyTradesResetAt.setHours(24, 0, 0, 0);

        if (subscription) {
          await supabase.from('subscriptions').update({
            daily_trades_used: 0,
            daily_trades_reset_at: dailyTradesResetAt.toISOString(),
            updated_at: now.toISOString()
          }).eq('id', subscription.id);
        }
      }

      if (dailyTradesUsed >= limits.dailyTradeLimit) {
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: `Daily trade limit reached (${limits.dailyTradeLimit} trades/day). Upgrade for more trades or wait until tomorrow.`,
            planTier,
            dailyTradesUsed,
            dailyTradeLimit: limits.dailyTradeLimit,
            resetsAt: dailyTradesResetAt.toISOString()
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // All checks passed - increment trade count and return success
    const newTradeCount = (subscription?.daily_trades_used || 0) + 1;

    if (subscription) {
      await supabase.from('subscriptions').update({
        daily_trades_used: newTradeCount,
        updated_at: new Date().toISOString()
      }).eq('id', subscription.id);
    }

    return new Response(
      JSON.stringify({
        allowed: true,
        planTier,
        isPaperOnly: limits.paperOnly,
        dailyTradesUsed: newTradeCount,
        dailyTradeLimit: limits.dailyTradeLimit,
        dailyTradesRemaining: limits.dailyTradeLimit === -1 ? -1 : limits.dailyTradeLimit - newTradeCount
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Verify trade error:', error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
