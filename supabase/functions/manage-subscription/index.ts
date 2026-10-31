import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { stripe } from '../_shared/stripe.ts';
import { createSupabaseAdmin, getUserFromToken } from '../_shared/supabase.ts';

interface ManageRequest {
  action: 'get' | 'cancel' | 'resume' | 'portal' | 'record_trade';
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
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

    // Initialize Supabase admin client
    const supabase = createSupabaseAdmin();

    // Parse request body
    const body: ManageRequest = req.method === 'POST' ? await req.json() : { action: 'get' };
    const { action } = body;

    // Get user's subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Handle different actions
    switch (action) {
      case 'get': {
        if (!subscription) {
          // Return free tier info if no subscription
          return new Response(
            JSON.stringify({
              subscription: null,
              planTier: 'free',
              status: 'active',
              dailyTradesRemaining: 5,
              dailyTradeLimit: 5,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Check if daily trades need reset
        const now = new Date();
        const resetAt = new Date(subscription.daily_trades_reset_at);

        if (now > resetAt) {
          // Reset daily trades
          const newResetAt = new Date(now);
          newResetAt.setHours(24, 0, 0, 0);

          await supabase
            .from('subscriptions')
            .update({
              daily_trades_used: 0,
              daily_trades_reset_at: newResetAt.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', subscription.id);

          subscription.daily_trades_used = 0;
          subscription.daily_trades_reset_at = newResetAt.toISOString();
        }

        // Calculate daily trades limit based on plan
        const dailyTradeLimits: Record<string, number> = {
          free: 5,
          starter: 25,
          pro: 100,
          elite: -1,
          desktop: -1,
        };

        const dailyTradeLimit = dailyTradeLimits[subscription.plan_tier] || 5;
        const dailyTradesRemaining = dailyTradeLimit === -1
          ? -1
          : Math.max(0, dailyTradeLimit - subscription.daily_trades_used);

        return new Response(
          JSON.stringify({
            subscription: {
              id: subscription.id,
              planTier: subscription.plan_tier,
              billingCycle: subscription.billing_cycle,
              status: subscription.status,
              startDate: subscription.start_date,
              endDate: subscription.end_date,
              autoRenew: subscription.auto_renew,
              licenseCode: subscription.license_code,
              dailyTradesUsed: subscription.daily_trades_used,
              dailyTradesResetAt: subscription.daily_trades_reset_at,
            },
            planTier: subscription.plan_tier,
            status: subscription.status,
            dailyTradesRemaining,
            dailyTradeLimit,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'cancel': {
        if (!subscription || !subscription.stripe_subscription_id) {
          return new Response(
            JSON.stringify({ error: 'No active subscription to cancel' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Cancel at period end (user keeps access until end date)
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });

        await supabase
          .from('subscriptions')
          .update({
            auto_renew: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Subscription will cancel at the end of the billing period',
            endDate: subscription.end_date,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'resume': {
        if (!subscription || !subscription.stripe_subscription_id) {
          return new Response(
            JSON.stringify({ error: 'No subscription to resume' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Resume subscription (undo cancel at period end)
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: false,
        });

        await supabase
          .from('subscriptions')
          .update({
            auto_renew: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Subscription has been resumed',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'portal': {
        if (!subscription || !subscription.stripe_customer_id) {
          return new Response(
            JSON.stringify({ error: 'No Stripe customer found' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Create Stripe Customer Portal session
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: subscription.stripe_customer_id,
          return_url: `${Deno.env.get('FRONTEND_URL')}/dashboard/settings`,
        });

        return new Response(
          JSON.stringify({ url: portalSession.url }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'record_trade': {
        if (!subscription) {
          // For free tier, we still track trades in memory on the client
          return new Response(
            JSON.stringify({ success: true, dailyTradesUsed: 0 }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Check daily trade limit
        const dailyTradeLimits: Record<string, number> = {
          free: 5,
          starter: 25,
          pro: 100,
          elite: -1,
          desktop: -1,
        };

        const dailyTradeLimit = dailyTradeLimits[subscription.plan_tier] || 5;

        if (dailyTradeLimit !== -1 && subscription.daily_trades_used >= dailyTradeLimit) {
          return new Response(
            JSON.stringify({
              error: 'Daily trade limit reached',
              dailyTradesUsed: subscription.daily_trades_used,
              dailyTradeLimit,
            }),
            {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Increment trade count
        const newTradeCount = subscription.daily_trades_used + 1;

        await supabase
          .from('subscriptions')
          .update({
            daily_trades_used: newTradeCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);

        return new Response(
          JSON.stringify({
            success: true,
            dailyTradesUsed: newTradeCount,
            dailyTradesRemaining: dailyTradeLimit === -1 ? -1 : dailyTradeLimit - newTradeCount,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }
  } catch (error) {
    console.error('Manage subscription error:', error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
