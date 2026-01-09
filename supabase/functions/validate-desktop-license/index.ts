import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { licenseCode, machineId } = await req.json();

    if (!licenseCode) {
      return new Response(
        JSON.stringify({ valid: false, error: 'License code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up the license in the licenses table
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('code', licenseCode.toUpperCase())
      .single();

    if (licenseError || !license) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid license code' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if license is for desktop
    if (license.plan_tier !== 'desktop') {
      return new Response(
        JSON.stringify({ valid: false, error: 'This license is not valid for desktop' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if license is already activated on a different machine
    if (license.machine_id && license.machine_id !== machineId) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'License already activated on another machine. Contact support to transfer.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If not yet activated, activate it now
    if (!license.is_active || !license.machine_id) {
      const { error: updateError } = await supabase
        .from('licenses')
        .update({
          is_active: true,
          activated_at: new Date().toISOString(),
          machine_id: machineId,
        })
        .eq('id', license.id);

      if (updateError) {
        console.error('Error activating license:', updateError);
        return new Response(
          JSON.stringify({ valid: false, error: 'Failed to activate license' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // License is valid
    return new Response(
      JSON.stringify({
        valid: true,
        plan_tier: license.plan_tier,
        activated_at: license.activated_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ valid: false, error: 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
