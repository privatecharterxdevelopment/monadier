/**
 * Admin trade desk — logged-in admin JWT in, Railway force-open out.
 * Secret stays on the server. No paste, no Railway CLI.
 */
const ADMIN_EMAILS = ['ipsunlorem@gmail.com', 'lorenzo.vanza@hotmail.com'];
const BOT_API = (
  process.env.BOT_API_URL ||
  process.env.VITE_BOT_API_URL ||
  'https://monadier-production.up.railway.app'
).replace(/\/$/, '');

function json(res, status, body) {
  res.status(status).json(body);
}

async function adminEmailFromBearer(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return null;
  const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!r.ok) return null;
  const user = await r.json();
  const email = String(user?.email || '').trim().toLowerCase();
  return email || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { success: false, error: 'POST only' });
    return;
  }

  const secret = (process.env.BOT_ADMIN_SECRET || process.env.VITE_BOT_ADMIN_SECRET || '').trim();
  if (!secret) {
    json(res, 503, {
      success: false,
      error: 'BOT_ADMIN_SECRET missing on Vercel — add it (same value as Railway).',
    });
    return;
  }

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const extra = String(process.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set([...ADMIN_EMAILS, ...extra]);
  const email = await adminEmailFromBearer(token);
  if (!email || !allowed.has(email)) {
    json(res, 401, { success: false, error: 'Admin session required' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const coin = String(body.coin || '').trim().toUpperCase();
  const directionRaw = String(body.direction || 'LONG').trim().toUpperCase();
  const direction = directionRaw === 'SHORT' ? 'SHORT' : 'LONG';
  if (!coin || coin.length > 20) {
    json(res, 400, { success: false, error: 'coin required' });
    return;
  }

  const payload = {
    coin,
    direction,
    leverage: body.leverage,
    wallets: Array.isArray(body.wallets) ? body.wallets : undefined,
    dryRun: Boolean(body.dryRun),
  };

  try {
    const upstream = await fetch(`${BOT_API}/api/admin/force-open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-admin-secret': secret,
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    json(res, upstream.status, data);
  } catch (err) {
    json(res, 502, {
      success: false,
      error: err instanceof Error ? err.message : 'force-open proxy failed',
    });
  }
}
