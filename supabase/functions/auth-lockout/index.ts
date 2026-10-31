import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const MAX_FAILS = 2;
const BLOCK_HOURS = 24;

const ADMIN_EMAILS = (
  Deno.env.get('ADMIN_EMAILS') ||
  'ipsunlorem@gmail.com,lorenzo.vanza@hotmail.com'
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf?.trim()) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  const real = req.headers.get('x-real-ip');
  if (real?.trim()) return real.trim();
  return 'unknown';
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`hg-lockout:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server misconfigured' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const ip = clientIp(req);
  const ipHash = await hashIp(ip);
  const now = new Date();

  let body: { action?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = (body.action || 'check').toLowerCase();

  const { data: row } = await admin
    .from('auth_ip_lockouts')
    .select('fail_count, blocked_until, last_email')
    .eq('ip_hash', ipHash)
    .maybeSingle();

  const blockedUntil = row?.blocked_until ? new Date(row.blocked_until) : null;
  const currentlyBlocked = Boolean(blockedUntil && blockedUntil > now);

  if (currentlyBlocked) {
    return json(
      {
        blocked: true,
        blockedUntil: blockedUntil?.toISOString() ?? null,
      },
      403
    );
  }

  if (action === 'check') {
    return json({ blocked: false, blockedUntil: null });
  }

  // Count toward lockout: admin-email password fails, or secret-path probes
  const email = (body.email || '').trim().toLowerCase();
  const counts =
    action === 'probe' || (action === 'fail' && email && ADMIN_EMAILS.includes(email));

  if (!counts) {
    return json({ blocked: false, counted: false });
  }

  let failCount = Number(row?.fail_count || 0) + 1;
  let nextBlocked: string | null = null;
  if (failCount >= MAX_FAILS) {
    nextBlocked = new Date(now.getTime() + BLOCK_HOURS * 3600_000).toISOString();
    failCount = MAX_FAILS;
  }

  await admin.from('auth_ip_lockouts').upsert(
    {
      ip_hash: ipHash,
      fail_count: failCount,
      blocked_until: nextBlocked,
      last_email: email || row?.last_email || null,
      updated_at: now.toISOString(),
    },
    { onConflict: 'ip_hash' }
  );

  if (nextBlocked) {
    return json({ blocked: true, blockedUntil: nextBlocked }, 403);
  }

  return json({ blocked: false, failCount, remaining: MAX_FAILS - failCount });
});
