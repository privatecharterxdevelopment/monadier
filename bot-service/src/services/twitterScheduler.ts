import { createClient } from '@supabase/supabase-js';
import { BRAND_NAME } from '../brand';
import { config } from '../config';
import { logger } from '../utils/logger';
import { composeBotTweet } from './twitterComposer';
import { renderWinFlyerPng, type WinFlyerInput } from './tradeShareFlyer';
import { postTweet, twitterCredentialsConfigured, uploadMediaPng } from './twitterClient';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const APP_URL = (process.env.APP_PUBLIC_URL || 'https://app.hypergain.io').replace(/\/$/, '');

export type TwitterSettings = {
  id: number;
  enabled: boolean;
  require_approval: boolean;
  posts_per_day: number;
  post_hours_utc: number[];
  brand_handle: string | null;
  site_url: string | null;
  tweet_template: string | null;
  win_flyer_enabled: boolean;
  win_flyer_hour_utc: number;
  win_flyer_lookback_hours: number;
  last_generated_at: string | null;
  last_posted_at: string | null;
  updated_at: string;
};

export type TwitterPostRow = {
  id: string;
  body: string;
  status: string;
  source: string;
  scheduled_for: string | null;
  posted_at: string | null;
  twitter_id: string | null;
  error: string | null;
  stats_snapshot: unknown;
  slot_key: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

type WinFlyerSnapshot = {
  kind: 'win_flyer';
  flyer: WinFlyerInput;
  tradeId: string;
  wallet: string;
};

function utcSlotKey(d = new Date(), hour?: number): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = hour ?? d.getUTCHours();
  return `${y}-${m}-${day}T${String(h).padStart(2, '0')}`;
}

function utcWinFlyerSlotKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `win-flyer-${y}-${m}-${day}`;
}

function normalizeHours(hours: number[] | null | undefined, postsPerDay: number): number[] {
  const defaults = [10, 18];
  const raw = (hours?.length ? hours : defaults)
    .map((h) => Math.floor(Number(h)))
    .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23);
  const unique = [...new Set(raw)].sort((a, b) => a - b);
  if (unique.length === 0) return defaults.slice(0, postsPerDay);
  return unique.slice(0, Math.max(1, postsPerDay));
}

function maskWallet(wallet: string): string {
  const w = wallet.toLowerCase();
  if (w.length < 10) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

function buildReferralUrl(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'HYPERGAIN';
  return `${APP_URL}/?ref=${encodeURIComponent(normalized)}`;
}

function composeWinFlyerCaption(opts: {
  displayName: string;
  coin: string;
  side: 'LONG' | 'SHORT';
  pnlUsd: number;
  siteUrl?: string | null;
  brandHandle?: string | null;
}): string {
  const pnl = opts.pnlUsd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
  const signed = opts.pnlUsd >= 0 ? `+${pnl.replace('$', '')}` : pnl.replace('$', '-');
  const handle = (opts.brandHandle || '').trim();
  const site = (opts.siteUrl || APP_URL).replace(/^https?:\/\//, '');
  const lines = [
    `${BRAND_NAME} daily win 🟢`,
    `${opts.displayName} closed ${signed} USD on ${opts.coin} ${opts.side}`,
    handle ? handle : site,
  ];
  let body = lines.join('\n');
  if (body.length > 280) {
    body = `${BRAND_NAME}: ${opts.coin} ${opts.side} ${signed} USD\n${site}`.slice(0, 280);
  }
  return body;
}

export async function loadTwitterSettings(): Promise<TwitterSettings | null> {
  const { data, error } = await supabase
    .from('twitter_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    logger.warn('twitter_settings read failed', { error: error.message });
    return null;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    ...(data as TwitterSettings),
    win_flyer_enabled: Boolean(row.win_flyer_enabled ?? false),
    win_flyer_hour_utc: Number(row.win_flyer_hour_utc ?? 16),
    win_flyer_lookback_hours: Number(row.win_flyer_lookback_hours ?? 24),
  };
}

async function resolveTraderProfile(wallet: string): Promise<{
  displayName: string;
  avatarUrl: string | null;
  referralCode: string;
}> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, wallet_address')
    .ilike('wallet_address', wallet)
    .maybeSingle();

  let referralCode = 'HYPERGAIN';
  if (profile?.id) {
    const { data: codeRow } = await supabase
      .from('referral_codes')
      .select('code')
      .eq('user_id', profile.id)
      .maybeSingle();
    if (codeRow?.code) referralCode = String(codeRow.code).toUpperCase();
  }

  const displayName =
    (profile?.username && String(profile.username).trim()) ||
    (profile?.full_name && String(profile.full_name).trim()) ||
    maskWallet(wallet);

  return {
    displayName,
    avatarUrl: profile?.avatar_url ? String(profile.avatar_url) : null,
    referralCode,
  };
}

async function pickRandomWinningTrade(lookbackHours: number): Promise<{
  id: string;
  wallet_address: string;
  token_symbol: string;
  direction: string;
  leverage: number | null;
  entry_price: number;
  exit_price: number | null;
  entry_amount: number;
  profit_loss: number;
  closed_at: string;
} | null> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('trade_history')
    .select(
      'id, wallet_address, token_symbol, direction, leverage, entry_price, exit_price, entry_amount, profit_loss, closed_at'
    )
    .gt('profit_loss', 0)
    .not('closed_at', 'is', null)
    .gte('closed_at', since)
    .order('closed_at', { ascending: false })
    .limit(250);

  if (error) {
    logger.warn('win flyer trade pick failed', { error: error.message });
    return null;
  }
  const rows = data ?? [];
  if (!rows.length) return null;
  const pick = rows[Math.floor(Math.random() * rows.length)];
  return pick as (typeof rows)[number];
}

function flyerFromTrade(
  trade: NonNullable<Awaited<ReturnType<typeof pickRandomWinningTrade>>>,
  profile: Awaited<ReturnType<typeof resolveTraderProfile>>
): WinFlyerInput {
  const side = String(trade.direction || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const closePrice = Number(trade.exit_price) || Number(trade.entry_price) || 0;
  const entryPrice = Number(trade.entry_price) || null;
  const size = Math.abs(Number(trade.entry_amount) || 0);
  return {
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    coin: String(trade.token_symbol || '???').toUpperCase().replace(/-PERP$/i, ''),
    side,
    closedPnlUsd: Number(trade.profit_loss) || 0,
    closePrice,
    entryPrice,
    size,
    closedAtMs: trade.closed_at ? new Date(trade.closed_at).getTime() : Date.now(),
    referralCode: profile.referralCode,
    venueLabel: 'Hyperliquid Perp',
    leverage: trade.leverage != null ? Number(trade.leverage) : null,
    referralUrl: buildReferralUrl(profile.referralCode),
  };
}

export async function generateTwitterDraft(opts?: {
  source?: 'auto' | 'manual';
  slotKey?: string | null;
  force?: boolean;
}): Promise<{ ok: boolean; post?: TwitterPostRow; error?: string; skipped?: boolean }> {
  const settings = await loadTwitterSettings();
  if (!settings) return { ok: false, error: 'twitter_settings missing — run migration' };

  const slotKey = opts?.slotKey ?? null;
  if (slotKey && !opts?.force) {
    const { data: existing } = await supabase
      .from('twitter_posts')
      .select('id')
      .eq('slot_key', slotKey)
      .maybeSingle();
    if (existing?.id) return { ok: true, skipped: true };
  }

  const composed = await composeBotTweet({
    siteUrl: settings.site_url,
    brandHandle: settings.brand_handle,
    tweetTemplate: settings.tweet_template,
  });
  const requireApproval = settings.require_approval;
  const status = requireApproval ? 'draft' : 'approved';
  const nowIso = new Date().toISOString();

  const { data: post, error } = await supabase
    .from('twitter_posts')
    .insert({
      body: composed.body,
      status,
      source: opts?.source ?? 'auto',
      scheduled_for: requireApproval ? null : nowIso,
      stats_snapshot: { ...composed.stats, engine: composed.engine },
      slot_key: slotKey,
      approved_at: requireApproval ? null : nowIso,
      approved_by: requireApproval ? null : 'auto',
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (error) {
    if (error.message?.includes('twitter_posts_slot_key')) {
      return { ok: true, skipped: true };
    }
    return { ok: false, error: error.message };
  }

  await supabase
    .from('twitter_settings')
    .update({ last_generated_at: nowIso, updated_at: nowIso })
    .eq('id', 1);

  logger.info('twitter draft created', {
    id: post.id,
    status,
    engine: composed.engine,
    slotKey,
  });

  return { ok: true, post: post as TwitterPostRow };
}

/** Daily random winning-trade flyer (PNG attached at publish). */
export async function generateWinFlyerDraft(opts?: {
  force?: boolean;
  slotKey?: string | null;
}): Promise<{ ok: boolean; post?: TwitterPostRow; error?: string; skipped?: boolean }> {
  const settings = await loadTwitterSettings();
  if (!settings) return { ok: false, error: 'twitter_settings missing — run migration' };

  const slotKey = opts?.force
    ? opts.slotKey ?? `win-flyer-manual-${Date.now()}`
    : opts?.slotKey ?? utcWinFlyerSlotKey();
  if (!opts?.force) {
    const { data: existing } = await supabase
      .from('twitter_posts')
      .select('id')
      .eq('slot_key', slotKey)
      .maybeSingle();
    if (existing?.id) return { ok: true, skipped: true };
  }

  const lookback = Math.max(6, Math.min(168, settings.win_flyer_lookback_hours || 24));
  const trade = await pickRandomWinningTrade(lookback);
  if (!trade) {
    return {
      ok: false,
      error: `No profitable closes in the last ${lookback}h`,
    };
  }

  const profile = await resolveTraderProfile(String(trade.wallet_address).toLowerCase());
  const flyer = flyerFromTrade(trade, profile);
  const body = composeWinFlyerCaption({
    displayName: flyer.displayName,
    coin: flyer.coin,
    side: flyer.side,
    pnlUsd: flyer.closedPnlUsd,
    siteUrl: settings.site_url,
    brandHandle: settings.brand_handle,
  });

  const requireApproval = settings.require_approval;
  const status = requireApproval ? 'draft' : 'approved';
  const nowIso = new Date().toISOString();
  const snapshot: WinFlyerSnapshot = {
    kind: 'win_flyer',
    flyer,
    tradeId: String(trade.id),
    wallet: String(trade.wallet_address).toLowerCase(),
  };

  const { data: post, error } = await supabase
    .from('twitter_posts')
    .insert({
      body,
      status,
      source: 'auto',
      scheduled_for: requireApproval ? null : nowIso,
      stats_snapshot: snapshot,
      slot_key: slotKey,
      approved_at: requireApproval ? null : nowIso,
      approved_by: requireApproval ? null : 'auto',
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (error) {
    if (error.message?.includes('twitter_posts_slot_key')) {
      return { ok: true, skipped: true };
    }
    return { ok: false, error: error.message };
  }

  await supabase
    .from('twitter_settings')
    .update({ last_generated_at: nowIso, updated_at: nowIso })
    .eq('id', 1);

  logger.info('twitter win flyer draft created', {
    id: post.id,
    status,
    slotKey,
    coin: flyer.coin,
    pnl: flyer.closedPnlUsd,
  });

  return { ok: true, post: post as TwitterPostRow };
}

function asWinFlyerSnapshot(raw: unknown): WinFlyerSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== 'win_flyer' || !obj.flyer || typeof obj.flyer !== 'object') return null;
  return obj as WinFlyerSnapshot;
}

export async function publishTwitterPost(
  postId: string
): Promise<{ ok: boolean; twitterId?: string; error?: string }> {
  if (!twitterCredentialsConfigured()) {
    return { ok: false, error: 'X API credentials not configured on Railway' };
  }

  const { data: post, error } = await supabase
    .from('twitter_posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();

  if (error || !post) return { ok: false, error: error?.message ?? 'Post not found' };
  if (post.status === 'posted' && post.twitter_id) {
    return { ok: true, twitterId: post.twitter_id };
  }
  if (!['draft', 'approved', 'scheduled', 'failed'].includes(post.status)) {
    return { ok: false, error: `Cannot post from status=${post.status}` };
  }

  await supabase
    .from('twitter_posts')
    .update({ status: 'posting', updated_at: new Date().toISOString() })
    .eq('id', postId);

  let mediaIds: string[] | undefined;
  const winSnap = asWinFlyerSnapshot(post.stats_snapshot);
  if (winSnap?.flyer) {
    try {
      const png = await renderWinFlyerPng(winSnap.flyer);
      const up = await uploadMediaPng(png);
      if (!up.ok || !up.mediaId) {
        const nowIso = new Date().toISOString();
        await supabase
          .from('twitter_posts')
          .update({
            status: 'failed',
            error: up.error ?? 'media upload failed',
            updated_at: nowIso,
          })
          .eq('id', postId);
        return { ok: false, error: up.error ?? 'media upload failed' };
      }
      mediaIds = [up.mediaId];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from('twitter_posts')
        .update({
          status: 'failed',
          error: `flyer render failed: ${msg}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
      return { ok: false, error: msg };
    }
  }

  const result = await postTweet(String(post.body), mediaIds);
  const nowIso = new Date().toISOString();

  if (!result.ok) {
    await supabase
      .from('twitter_posts')
      .update({
        status: 'failed',
        error: result.error ?? 'post failed',
        updated_at: nowIso,
      })
      .eq('id', postId);
    return { ok: false, error: result.error };
  }

  await supabase
    .from('twitter_posts')
    .update({
      status: 'posted',
      twitter_id: result.twitterId,
      posted_at: nowIso,
      error: null,
      updated_at: nowIso,
      stats_snapshot: winSnap
        ? { ...winSnap, mediaId: mediaIds?.[0] ?? null }
        : post.stats_snapshot,
    })
    .eq('id', postId);

  await supabase
    .from('twitter_settings')
    .update({ last_posted_at: nowIso, updated_at: nowIso })
    .eq('id', 1);

  logger.info('twitter posted', {
    id: postId,
    twitterId: result.twitterId,
    media: Boolean(mediaIds?.length),
  });
  return { ok: true, twitterId: result.twitterId };
}

/** Cron tick: AI slot drafts + daily win flyer + publish due posts. */
export async function runTwitterSocialTick(): Promise<void> {
  const settings = await loadTwitterSettings();
  if (!settings?.enabled) return;

  const hours = normalizeHours(settings.post_hours_utc, settings.posts_per_day);
  const now = new Date();
  const currentHour = now.getUTCHours();

  if (hours.includes(currentHour)) {
    const slotKey = utcSlotKey(now, currentHour);
    const gen = await generateTwitterDraft({ source: 'auto', slotKey });
    if (gen.ok && gen.post && !settings.require_approval && twitterCredentialsConfigured()) {
      await publishTwitterPost(gen.post.id);
    }
  }

  if (settings.win_flyer_enabled) {
    const flyerHour = Math.max(0, Math.min(23, Math.floor(Number(settings.win_flyer_hour_utc ?? 16))));
    if (currentHour === flyerHour) {
      const gen = await generateWinFlyerDraft({ slotKey: utcWinFlyerSlotKey(now) });
      if (gen.ok && gen.post && !settings.require_approval && twitterCredentialsConfigured()) {
        await publishTwitterPost(gen.post.id);
      }
    }
  }

  if (!twitterCredentialsConfigured()) return;

  const dueBefore = now.toISOString();
  const { data: dueNull } = await supabase
    .from('twitter_posts')
    .select('id')
    .in('status', ['approved', 'scheduled'])
    .is('scheduled_for', null)
    .order('created_at', { ascending: true })
    .limit(5);

  const { data: dueTimed } = await supabase
    .from('twitter_posts')
    .select('id')
    .in('status', ['approved', 'scheduled'])
    .lte('scheduled_for', dueBefore)
    .order('created_at', { ascending: true })
    .limit(5);

  const seen = new Set<string>();
  for (const row of [...(dueNull ?? []), ...(dueTimed ?? [])]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    await publishTwitterPost(row.id);
  }
}

export async function getTwitterAdminStatus(): Promise<{
  settings: TwitterSettings | null;
  credentialsConfigured: boolean;
  openaiConfigured: boolean;
  recent: TwitterPostRow[];
}> {
  const settings = await loadTwitterSettings();
  const { data: recent } = await supabase
    .from('twitter_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  return {
    settings,
    credentialsConfigured: twitterCredentialsConfigured(),
    openaiConfigured: Boolean(config.hyperliquid.news.openaiApiKey),
    recent: (recent ?? []) as TwitterPostRow[],
  };
}
