import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromToken } from '../_shared/supabase.ts';

interface ActivateLicenseRequest {
  licenseCode: string;
  walletAddress?: string;
  machineId?: string;
}

// Validate license code format
function validateLicenseFormat(code: string): { valid: boolean; planTier?: string; error?: string } {
  const pattern = /^(FRE|STR|PRO|ELT|DSK)-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-(\d{3})$/;
  const match = code.toUpperCase().match(pattern);

  if (!match) {
    return { valid: false, error: 'Invalid license code format' };
  }

  const [, prefix, seg1, seg2, seg3, seg4, checksum] = match;

  // Verify checksum
  const baseCode = `${prefix}-${seg1}-${seg2}-${seg3}-${seg4}`;
  let sum = 0;
  for (const char of baseCode.replace(/-/g, '')) {
    sum += char.charCodeAt(0);
  }
  const expectedChecksum = (sum % 1000).toString().padStart(3, '0');

  if (checksum !== expectedChecksum) {
    return { valid: false, error: 'Invalid license code checksum' };
  }

  const planTierMap: Record<string, string> = {
    'FRE': 'free',
    'STR': 'starter',
    'PRO': 'pro',
    'ELT': 'elite',
    'DSK': 'desktop',
  };

  return { valid: true, planTier: planTierMap[prefix] };
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
    const body: ActivateLicenseRequest = await req.json();
    const { licenseCode, walletAddress, machineId } = body;

    if (!licenseCode) {
      return new Response(JSON.stringify({ error: 'License code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate license format
    const validation = validateLicenseFormat(licenseCode.toUpperCase());
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const planTier = validation.planTier!;

    // Free tier doesn't need license activation
    if (planTier === 'free') {
      return new Response(JSON.stringify({ error: 'Free tier does not require a license code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase admin client
    const supabase = createSupabaseAdmin();

    // Check if license exists and is valid
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('code', licenseCode.toUpperCase())
      .single();

    if (licenseError || !license) {
      return new Response(JSON.stringify({ error: 'License code not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if license is already activated by another user
    if (license.activated_by && license.activated_by !== user.id) {
      return new Response(
        JSON.stringify({ error: 'License already activated by another user' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if license has expired
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'License has expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For desktop licenses, check machine ID
    if (planTier === 'desktop' && license.machine_id && machineId && license.machine_id !== machineId) {
      return new Response(
        JSON.stringify({
          error: 'License already activated on another machine. Contact support to transfer.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const now = new Date();

    // Calculate end date based on billing cycle
    const endDate = new Date(now);
    if (license.billing_cycle === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (license.billing_cycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      // Lifetime
      endDate.setFullYear(endDate.getFullYear() + 100);
    }

    // Update license as activated
    await supabase
      .from('licenses')
      .update({
        is_active: true,
        activated_at: now.toISOString(),
        activated_by: user.id,
        machine_id: planTier === 'desktop' ? machineId : null,
      })
      .eq('id', license.id);

    // Check if user already has a subscription
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const subscriptionData = {
      user_id: user.id,
      wallet_address: walletAddress || null,
      plan_tier: planTier,
      billing_cycle: license.billing_cycle,
      status: 'active',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      license_code: licenseCode.toUpperCase(),
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
      auto_renew: false, // Manual license activation doesn't auto-renew
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

    // Calculate daily trades limit
    const dailyTradeLimits: Record<string, number> = {
      starter: 25,
      pro: 100,
      elite: -1,
      desktop: -1,
    };

    return new Response(
      JSON.stringify({
        success: true,
        subscription: {
          planTier,
          billingCycle: license.billing_cycle,
          status: 'active',
          startDate: now.toISOString(),
          endDate: endDate.toISOString(),
          dailyTradeLimit: dailyTradeLimits[planTier] || 25,
          licenseCode: licenseCode.toUpperCase(),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Activate license error:', error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
