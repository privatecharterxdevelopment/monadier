import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { stripe, PlanTier, BillingCycle } from '../_shared/stripe.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';

// Generate a unique license code
function generateLicenseCode(planTier: string): string {
  const prefixMap: Record<string, string> = {
    starter: 'STR',
    pro: 'PRO',
    elite: 'ELT',
    desktop: 'DSK',
  };
  const prefix = prefixMap[planTier] || 'LIC';

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const generateSegment = (len: number) => {
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const seg1 = generateSegment(4);
  const seg2 = generateSegment(4);
  const seg3 = generateSegment(4);
  const seg4 = generateSegment(4);

  // Calculate checksum
  const baseCode = `${prefix}-${seg1}-${seg2}-${seg3}-${seg4}`;
  let sum = 0;
  for (const char of baseCode.replace(/-/g, '')) {
    sum += char.charCodeAt(0);
  }
  const checksum = (sum % 1000).toString().padStart(3, '0');

  return `${baseCode}-${checksum}`;
}

// Calculate subscription end date
function calculateEndDate(billingCycle: string): Date {
  const now = new Date();
  switch (billingCycle) {
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() + 1));
    case 'yearly':
      return new Date(now.setFullYear(now.getFullYear() + 1));
    case 'lifetime':
      return new Date(now.setFullYear(now.getFullYear() + 100));
    default:
      return new Date(now.setMonth(now.getMonth() + 1));
  }
}

serve(async (req: Request) => {
  // Webhook doesn't use CORS (server-to-server)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the webhook signature
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the raw body
    const body = await req.text();

    // Verify the webhook signature
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('Webhook secret not configured');
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase admin client
    const supabase = createSupabaseAdmin();

    console.log('Processing webhook event:', event.type);

    // Handle different event types
    switch (event.type) {
      // Checkout session completed (initial purchase)
      case 'checkout.session.completed': {
        const session = event.data.object;
        const metadata = session.metadata || {};

        const userId = metadata.supabase_user_id;
        const planTier = metadata.plan_tier as PlanTier;
        const billingCycle = metadata.billing_cycle as BillingCycle;
        const walletAddress = metadata.wallet_address;

        if (!userId || !planTier || !billingCycle) {
          console.error('Missing metadata in checkout session');
          break;
        }

        // Generate license code
        const licenseCode = generateLicenseCode(planTier);
        const endDate = calculateEndDate(billingCycle);
        const now = new Date();

        // Check if user already has a subscription
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', userId)
          .single();

        const subscriptionData = {
          user_id: userId,
          wallet_address: walletAddress || null,
          plan_tier: planTier,
          billing_cycle: billingCycle,
          status: 'active',
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string || null,
          license_code: licenseCode,
          start_date: now.toISOString(),
          end_date: endDate.toISOString(),
          auto_renew: billingCycle !== 'lifetime',
          daily_trades_used: 0,
          daily_trades_reset_at: new Date(now.setHours(24, 0, 0, 0)).toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (existingSub) {
          // Update existing subscription
          await supabase
            .from('subscriptions')
            .update(subscriptionData)
            .eq('id', existingSub.id);
        } else {
          // Create new subscription
          await supabase.from('subscriptions').insert({
            ...subscriptionData,
            created_at: new Date().toISOString(),
          });
        }

        // Create license record
        await supabase.from('licenses').insert({
          code: licenseCode,
          plan_tier: planTier,
          billing_cycle: billingCycle,
          is_active: true,
          activated_at: now.toISOString(),
          activated_by: userId,
          expires_at: billingCycle === 'lifetime' ? null : endDate.toISOString(),
          created_at: now.toISOString(),
        });

        // Record payment
        await supabase.from('payments').insert({
          user_id: userId,
          stripe_payment_id: session.payment_intent as string || session.id,
          stripe_customer_id: session.customer as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'usd',
          status: 'succeeded',
          plan_tier: planTier,
          billing_cycle: billingCycle,
          created_at: now.toISOString(),
        });

        console.log(`Subscription created for user ${userId}: ${planTier} (${billingCycle})`);
        break;
      }

      // Subscription updated (plan change, renewal)
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        // Get user from customer ID
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!existingSub) {
          console.error('No subscription found for customer:', customerId);
          break;
        }

        // Update subscription status
        const status = subscription.status === 'active' ? 'active' :
          subscription.status === 'past_due' ? 'expired' :
            subscription.status === 'canceled' ? 'cancelled' : existingSub.status;

        // Update end date from subscription period
        const endDate = new Date(subscription.current_period_end * 1000);

        await supabase
          .from('subscriptions')
          .update({
            status,
            end_date: endDate.toISOString(),
            auto_renew: !subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSub.id);

        console.log(`Subscription updated for customer ${customerId}: ${status}`);
        break;
      }

      // Subscription deleted/cancelled
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            auto_renew: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        console.log(`Subscription cancelled for customer ${customerId}`);
        break;
      }

      // Invoice payment succeeded (renewal)
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        const subscriptionId = invoice.subscription as string;

        // Only process subscription renewals (not initial payments)
        if (invoice.billing_reason === 'subscription_cycle') {
          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('stripe_subscription_id', subscriptionId)
            .single();

          if (existingSub) {
            // Extend subscription
            const endDate = calculateEndDate(existingSub.billing_cycle);

            await supabase
              .from('subscriptions')
              .update({
                status: 'active',
                end_date: endDate.toISOString(),
                daily_trades_used: 0,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingSub.id);

            // Record payment
            await supabase.from('payments').insert({
              user_id: existingSub.user_id,
              stripe_payment_id: invoice.payment_intent as string || invoice.id,
              stripe_customer_id: customerId,
              amount: invoice.amount_paid || 0,
              currency: invoice.currency || 'usd',
              status: 'succeeded',
              plan_tier: existingSub.plan_tier,
              billing_cycle: existingSub.billing_cycle,
              created_at: new Date().toISOString(),
            });

            console.log(`Subscription renewed for customer ${customerId}`);
          }
        }
        break;
      }

      // Invoice payment failed
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;

        // Mark subscription as past due
        await supabase
          .from('subscriptions')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        // Record failed payment
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('user_id, plan_tier, billing_cycle')
          .eq('stripe_customer_id', customerId)
          .single();

        if (existingSub) {
          await supabase.from('payments').insert({
            user_id: existingSub.user_id,
            stripe_payment_id: invoice.payment_intent as string || invoice.id,
            stripe_customer_id: customerId,
            amount: invoice.amount_due || 0,
            currency: invoice.currency || 'usd',
            status: 'failed',
            plan_tier: existingSub.plan_tier,
            billing_cycle: existingSub.billing_cycle,
            created_at: new Date().toISOString(),
          });
        }

        console.log(`Payment failed for customer ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
