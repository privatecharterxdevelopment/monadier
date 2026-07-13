import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { composeBotTweet } from './twitterComposer';
import { postTweet, twitterCredentialsConfigured } from './twitterClient';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export type TwitterSettings = {
  id: number;
  enabled: boolean;
  require_approval: boolean;
  posts_per_day: number;
  post_hours_utc: number[];
  brand_handle: string | null;
  site_url: string | null;
  tweet_template: string | null;
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

function utcSlotKey(d = new Date(), hour?: number): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = hour ?? d.getUTCHours();
  return `${y}-${m}-${day}T${String(h).padStart(2, '0')}`;
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
  return data as TwitterSettings | null;
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

  const result = await postTweet(String(post.body));
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
    })
    .eq('id', postId);

  await supabase
    .from('twitter_settings')
    .update({ last_posted_at: nowIso, updated_at: nowIso })
    .eq('id', 1);

  logger.info('twitter posted', { id: postId, twitterId: result.twitterId });
  return { ok: true, twitterId: result.twitterId };
}

/** Cron tick: generate due slots + publish approved posts that are due. */
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
