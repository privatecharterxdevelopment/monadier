import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Create Supabase client with service role key for admin operations
export function createSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Create Supabase client with user's JWT for authenticated operations
export function createSupabaseClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_ANON_KEY') || '',
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Get user from JWT token
export async function getUserFromToken(authHeader: string) {
  const supabase = createSupabaseClient(authHeader);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Invalid or expired token');
  }

  return user;
}

// Database types
export interface DbSubscription {
  id: string;
  user_id: string;
  wallet_address: string | null;
  plan_tier: string;
  billing_cycle: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  license_code: string | null;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  daily_trades_used: number;
  daily_trades_reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface DbLicense {
  id: string;
  code: string;
  plan_tier: string;
  billing_cycle: string;
  is_active: boolean;
  activated_at: string | null;
  activated_by: string | null;
  machine_id: string | null;
  created_at: string;
  expires_at: string | null;
}
