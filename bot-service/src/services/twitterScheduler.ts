import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { composeBotTweet } from './twitterComposer';
import { renderWinFlyerPng, type WinFlyerInput } from './tradeShareFlyer';
import { persistDailyTopFlyer } from './tradeFlyerStorage';
import { postTweet, twitterCredentialsConfigured, uploadMediaPng } from './twitterClient';
import {
  composeSolidCloseCaption,
  composeSolidCloseCaptionForX,
  resolveWinRoiPct,
} from './socialWinCaption';
import {
  metaCredentialsConfigured,
  publishWinFlyerToMeta,
} from './metaClient';

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

type BucketFlyerRow = {
  id: string;
  public_url: string;
  storage_path: string;
  coin: string | null;
  side: string | null;
  closed_pnl_usd: number | null;
  wallet_address: string | null;
  is_top_pick: boolean;
  trade_history_id: string | null;
};

type WinFlyerSnapshot = {
  kind: 'win_flyer';
  origin: 'bucket' | 'render';
  flyerId?: string;
  publicUrl?: string;
  storagePath?: string;
  flyer?: WinFlyerInput;
  tradeId?: string;
  wallet?: string;
  coin?: string;
  side?: 'LONG' | 'SHORT';
  pnlUsd?: number;
  roiPct?: number | null;
  facebookPostId?: string | null;
  instagramMediaId?: string | null;
  metaErrors?: string[];
};

function utcSlotKey(d = new Date(), hour?: number): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = hour ?? d.getUTCHours();
  return `${y}-${m}-${day}T${String(h).padStart(2, '0')}`;
}

function utcWinFlyerSlotKey(d = new Date(), hour?: number): string {
  return `win-flyer-${utcSlotKey(d, hour)}`;
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

/** Fixed hashtags live inside composeSolidCloseCaption (#$COIN #Hyperliquid #HyperGain). */
export const WIN_FLYER_HASHTAGS = '#Hyperliquid #HyperGain';

/**
 * Win-flyer caption — solid-close format with pair / PnL / ROI.
 * Prefer X-safe length; IG/FB use the same body.
 */
export function composeWinFlyerCaption(opts: {
  coin: string;
  side: 'LONG' | 'SHORT';
  pnlUsd: number;
  roiPct?: number | null;
  closePrice?: number | null;
  entryPrice?: number | null;
  size?: number | null;
  leverage?: number | null;
  siteUrl?: string | null;
  brandHandle?: string | null;
  displayName?: string;
  forX?: boolean;
}): string {
  const trade = {
    coin: opts.coin,
    side: opts.side,
    pnlUsd: opts.pnlUsd,
    roiPct: opts.roiPct,
    closePrice: opts.closePrice,
    entryPrice: opts.entryPrice,
    size: opts.size,
    leverage: opts.leverage,
  };
  return opts.forX === false
    ? composeSolidCloseCaption(trade)
    : composeSolidCloseCaptionForX(trade);
}

function envFlag(name: string): boolean | null {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (!raw) return null;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return null;
}

/** Railway override / default:
 * - X_SOCIAL_AUTO_PUBLISH=true → force enabled + no approval
 * - X_SOCIAL_AUTO_PUBLISH=false → respect DB only
 * - unset → auto when X API credentials are present (live keys already on Railway)
 */
export function twitterAutoPublishForced(): boolean {
  const flag = envFlag('X_SOCIAL_AUTO_PUBLISH');
  if (flag === false) return false;
  if (flag === true) return true;
  return twitterCredentialsConfigured();
}

function mapTwitterSettingsRow(data: Record<string, unknown>): TwitterSettings {
  return {
    ...(data as TwitterSettings),
    win_flyer_enabled: Boolean(data.win_flyer_enabled ?? false),
    win_flyer_hour_utc: Number(data.win_flyer_hour_utc ?? 16),
    win_flyer_lookback_hours: Number(data.win_flyer_lookback_hours ?? 24),
  };
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
  return mapTwitterSettingsRow(data as Record<string, unknown>);
}

/** Ensure singleton row exists; optionally force auto-publish flags from env. */
export async function ensureTwitterSettings(): Promise<TwitterSettings | null> {
  let settings = await loadTwitterSettings();
  if (!settings) {
    const nowIso = new Date().toISOString();
    const forceAuto = twitterAutoPublishForced();
    const { data, error } = await supabase
      .from('twitter_settings')
      .upsert(
        {
          id: 1,
          enabled: forceAuto,
          require_approval: !forceAuto,
          posts_per_day: 2,
          post_hours_utc: [10, 18],
          win_flyer_enabled: true,
          site_url: 'https://hypergain.io',
          updated_at: nowIso,
        },
        { onConflict: 'id' }
      )
      .select('*')
      .maybeSingle();
    if (error) {
      logger.warn('twitter_settings upsert failed', { error: error.message });
      return null;
    }
    if (!data) return null;
    settings = mapTwitterSettingsRow(data as Record<string, unknown>);
  }

  if (twitterAutoPublishForced() && (!settings.enabled || settings.require_approval || !settings.win_flyer_enabled)) {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('twitter_settings')
      .update({
        enabled: true,
        require_approval: false,
        win_flyer_enabled: true,
        updated_at: nowIso,
      })
      .eq('id', 1)
      .select('*')
      .maybeSingle();
    if (error) {
      logger.warn('twitter_settings auto-publish force failed', { error: error.message });
    } else if (data) {
      settings = mapTwitterSettingsRow(data as Record<string, unknown>);
      logger.info('twitter auto-publish forced — win flyers on, no approval');
    }
  }

  return settings;
}

/** Effective gates for generate/publish (DB + Railway override). */
export function effectiveTwitterGates(settings: TwitterSettings): {
  enabled: boolean;
  requireApproval: boolean;
} {
  if (twitterAutoPublishForced()) {
    return { enabled: true, requireApproval: false };
  }
  return {
    enabled: Boolean(settings.enabled),
    requireApproval: Boolean(settings.require_approval),
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
    .order('profit_loss', { ascending: false })
    .limit(40);

  if (error) {
    logger.warn('win flyer trade pick failed', { error: error.message });
    return null;
  }
  const rows = data ?? [];
  if (!rows.length) return null;
  // Random across winners so different traders rotate (not always #1 PnL).
  return rows[Math.floor(Math.random() * rows.length)] as (typeof rows)[number];
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

/** Prefer archived flyers not yet posted to X — random across the lookback pool. */
async function pickBucketFlyer(lookbackHours: number): Promise<BucketFlyerRow | null> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('trade_flyers')
    .select(
      'id, public_url, storage_path, coin, side, closed_pnl_usd, wallet_address, is_top_pick, trade_history_id'
    )
    .is('posted_to_x_at', null)
    .gte('created_at', since)
    .gt('closed_pnl_usd', 0)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    logger.warn('bucket flyer pick failed', { error: error.message });
    return null;
  }
  const rows = (data ?? []) as BucketFlyerRow[];
  if (!rows.length) return null;
  return rows[Math.floor(Math.random() * rows.length)] ?? null;
}

async function tradeDetailsForRoi(tradeHistoryId: string | null | undefined): Promise<{
  roiPct: number | null;
  closePrice: number | null;
  entryPrice: number | null;
  size: number | null;
  leverage: number | null;
} | null> {
  if (!tradeHistoryId) return null;
  const { data } = await supabase
    .from('trade_history')
    .select('leverage, entry_price, exit_price, entry_amount, profit_loss, direction')
    .eq('id', tradeHistoryId)
    .maybeSingle();
  if (!data) return null;
  const side = String(data.direction || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const closePrice = Number(data.exit_price) || Number(data.entry_price) || null;
  const entryPrice = Number(data.entry_price) || null;
  const size = Math.abs(Number(data.entry_amount) || 0) || null;
  const leverage = data.leverage != null ? Number(data.leverage) : null;
  const pnlUsd = Number(data.profit_loss) || 0;
  const roiPct = resolveWinRoiPct({
    coin: 'X',
    side,
    pnlUsd,
    closePrice,
    entryPrice,
    size,
    leverage,
  });
  return { roiPct, closePrice, entryPrice, size, leverage };
}

async function fetchPngFromUrl(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export async function generateTwitterDraft(opts?: {
  source?: 'auto' | 'manual';
  slotKey?: string | null;
  force?: boolean;
}): Promise<{ ok: boolean; post?: TwitterPostRow; error?: string; skipped?: boolean }> {
  const settings = await ensureTwitterSettings();
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
  const requireApproval = effectiveTwitterGates(settings).requireApproval;
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

/**
 * Flyer post for a schedule slot: bucket-first, fresh-render fallback.
 * PNG is attached at publish time.
 */
export async function generateWinFlyerDraft(opts?: {
  force?: boolean;
  slotKey?: string | null;
}): Promise<{ ok: boolean; post?: TwitterPostRow; error?: string; skipped?: boolean }> {
  const settings = await ensureTwitterSettings();
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
  const requireApproval = effectiveTwitterGates(settings).requireApproval;
  const status = requireApproval ? 'draft' : 'approved';
  const nowIso = new Date().toISOString();

  // 1) Bucket-first
  const bucket = await pickBucketFlyer(lookback);
  if (bucket?.public_url) {
    const side =
      String(bucket.side || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
    const coin = String(bucket.coin || 'TRADE').toUpperCase();
    const pnl = Number(bucket.closed_pnl_usd) || 0;
    const details = await tradeDetailsForRoi(bucket.trade_history_id);
    const body = composeWinFlyerCaption({
      coin,
      side,
      pnlUsd: pnl,
      roiPct: details?.roiPct,
      closePrice: details?.closePrice,
      entryPrice: details?.entryPrice,
      size: details?.size,
      leverage: details?.leverage,
    });
    const snapshot: WinFlyerSnapshot = {
      kind: 'win_flyer',
      origin: 'bucket',
      flyerId: bucket.id,
      publicUrl: bucket.public_url,
      storagePath: bucket.storage_path,
      wallet: bucket.wallet_address ?? undefined,
      coin,
      side,
      pnlUsd: pnl,
      roiPct: details?.roiPct ?? null,
      tradeId: bucket.trade_history_id ?? undefined,
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

    logger.info('twitter win flyer draft from bucket', {
      id: post.id,
      flyerId: bucket.id,
      slotKey,
      coin,
    });
    return { ok: true, post: post as TwitterPostRow };
  }

  // 2) Fallback — fresh render from trade_history
  const trade = await pickRandomWinningTrade(lookback);
  if (!trade) {
    return {
      ok: false,
      error: `No flyers in bucket and no profitable closes in the last ${lookback}h`,
    };
  }

  const profile = await resolveTraderProfile(String(trade.wallet_address).toLowerCase());
  const flyer = flyerFromTrade(trade, profile);
  const roiPct = resolveWinRoiPct({
    coin: flyer.coin,
    side: flyer.side,
    pnlUsd: flyer.closedPnlUsd,
    closePrice: flyer.closePrice,
    entryPrice: flyer.entryPrice,
    size: flyer.size,
    leverage: flyer.leverage,
  });
  const body = composeWinFlyerCaption({
    coin: flyer.coin,
    side: flyer.side,
    pnlUsd: flyer.closedPnlUsd,
    roiPct,
    closePrice: flyer.closePrice,
    entryPrice: flyer.entryPrice,
    size: flyer.size,
    leverage: flyer.leverage,
  });

  const snapshot: WinFlyerSnapshot = {
    kind: 'win_flyer',
    origin: 'render',
    flyer,
    tradeId: String(trade.id),
    wallet: String(trade.wallet_address).toLowerCase(),
    coin: flyer.coin,
    side: flyer.side,
    pnlUsd: flyer.closedPnlUsd,
    roiPct,
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

  try {
    const png = await renderWinFlyerPng(flyer);
    await persistDailyTopFlyer({
      png,
      coin: flyer.coin,
      side: flyer.side,
      closedPnlUsd: flyer.closedPnlUsd,
      walletAddress: String(trade.wallet_address).toLowerCase(),
      tradeHistoryId: String(trade.id),
      twitterPostId: post.id,
    });
  } catch (err: unknown) {
    logger.warn('win flyer storage on generate failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await supabase
    .from('twitter_settings')
    .update({ last_generated_at: nowIso, updated_at: nowIso })
    .eq('id', 1);

  logger.info('twitter win flyer draft from render fallback', {
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
  if (obj.kind !== 'win_flyer') return null;
  return obj as WinFlyerSnapshot;
}

export async function publishTwitterPost(
  postId: string
): Promise<{ ok: boolean; twitterId?: string; error?: string }> {
  const xReady = twitterCredentialsConfigured();
  const metaReady = metaCredentialsConfigured();
  if (!xReady && !metaReady) {
    return {
      ok: false,
      error: 'No social credentials — set X API keys and/or META_PAGE_* on Railway',
    };
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
  let publicImageUrl: string | null = null;
  const winSnap = asWinFlyerSnapshot(post.stats_snapshot);
  let png: Buffer | null = null;

  if (winSnap) {
    try {
      if (winSnap.origin === 'bucket' && winSnap.publicUrl) {
        publicImageUrl = winSnap.publicUrl;
        png = await fetchPngFromUrl(winSnap.publicUrl);
      }
      if (!png && winSnap.flyer) {
        png = await renderWinFlyerPng(winSnap.flyer);
      }
      if (!png) {
        const nowIso = new Date().toISOString();
        await supabase
          .from('twitter_posts')
          .update({
            status: 'failed',
            error: 'Could not load or render flyer PNG',
            updated_at: nowIso,
          })
          .eq('id', postId);
        return { ok: false, error: 'Could not load or render flyer PNG' };
      }

      // Meta IG needs a public HTTPS URL — persist render flyers if needed.
      if (!publicImageUrl && png) {
        const stored = await persistDailyTopFlyer({
          png,
          coin: winSnap.coin || winSnap.flyer?.coin || 'TRADE',
          side: winSnap.side || winSnap.flyer?.side || 'LONG',
          closedPnlUsd: winSnap.pnlUsd ?? winSnap.flyer?.closedPnlUsd ?? 0,
          walletAddress: winSnap.wallet ?? null,
          tradeHistoryId: winSnap.tradeId ?? null,
          twitterPostId: postId,
        });
        if (stored.ok && stored.publicUrl) {
          publicImageUrl = stored.publicUrl;
        }
      }

      if (xReady) {
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
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from('twitter_posts')
        .update({
          status: 'failed',
          error: `flyer media failed: ${msg}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
      return { ok: false, error: msg };
    }
  }

  let twitterId: string | undefined;
  let xError: string | undefined;
  if (xReady) {
    const result = await postTweet(String(post.body), mediaIds);
    if (!result.ok) {
      xError = result.error ?? 'X post failed';
    } else {
      twitterId = result.twitterId;
    }
  }

  const metaErrors: string[] = [];
  let facebookPostId: string | null = null;
  let instagramMediaId: string | null = null;
  if (winSnap && publicImageUrl && metaReady) {
    const caption =
      winSnap.coin && winSnap.side != null && winSnap.pnlUsd != null
        ? composeSolidCloseCaption({
            coin: winSnap.coin,
            side: winSnap.side,
            pnlUsd: winSnap.pnlUsd,
            roiPct: winSnap.roiPct,
            closePrice: winSnap.flyer?.closePrice,
            entryPrice: winSnap.flyer?.entryPrice,
            size: winSnap.flyer?.size,
            leverage: winSnap.flyer?.leverage,
          })
        : String(post.body);
    const meta = await publishWinFlyerToMeta({
      imageUrl: publicImageUrl,
      caption,
    });
    if (meta.facebook?.ok) facebookPostId = meta.facebook.postId ?? null;
    else if (meta.facebook?.error) metaErrors.push(`FB: ${meta.facebook.error}`);
    if (meta.instagram?.ok) instagramMediaId = meta.instagram.mediaId ?? null;
    else if (meta.instagram?.error) metaErrors.push(`IG: ${meta.instagram.error}`);
  } else if (winSnap && metaReady && !publicImageUrl) {
    metaErrors.push('Meta skipped — no public flyer URL');
  }

  const nowIso = new Date().toISOString();
  const anyOk = Boolean(twitterId) || Boolean(facebookPostId) || Boolean(instagramMediaId);
  if (!anyOk) {
    const errMsg = xError || metaErrors.join('; ') || 'all platforms failed';
    await supabase
      .from('twitter_posts')
      .update({
        status: 'failed',
        error: errMsg,
        updated_at: nowIso,
      })
      .eq('id', postId);
    return { ok: false, error: errMsg };
  }

  await supabase
    .from('twitter_posts')
    .update({
      status: 'posted',
      twitter_id: twitterId ?? post.twitter_id,
      posted_at: nowIso,
      error: [xError, ...metaErrors].filter(Boolean).join('; ') || null,
      updated_at: nowIso,
      stats_snapshot: winSnap
        ? {
            ...winSnap,
            mediaId: mediaIds?.[0] ?? null,
            publicUrl: publicImageUrl ?? winSnap.publicUrl,
            facebookPostId,
            instagramMediaId,
            metaErrors: metaErrors.length ? metaErrors : undefined,
          }
        : post.stats_snapshot,
    })
    .eq('id', postId);

  if (winSnap?.flyerId) {
    const flyerPatch: Record<string, unknown> = {
      posted_to_x_at: twitterId ? nowIso : undefined,
      is_top_pick: true,
    };
    if (facebookPostId) flyerPatch.posted_to_fb_at = nowIso;
    if (instagramMediaId) flyerPatch.posted_to_ig_at = nowIso;
    // Strip undefined keys
    for (const k of Object.keys(flyerPatch)) {
      if (flyerPatch[k] === undefined) delete flyerPatch[k];
    }
    await supabase.from('trade_flyers').update(flyerPatch).eq('id', winSnap.flyerId);
  }

  await supabase
    .from('twitter_settings')
    .update({ last_posted_at: nowIso, updated_at: nowIso })
    .eq('id', 1);

  logger.info('social win flyer posted', {
    id: postId,
    twitterId: twitterId ?? null,
    facebookPostId,
    instagramMediaId,
    xError: xError ?? null,
    metaErrors,
  });
  return { ok: true, twitterId };
}

/**
 * Hours due for auto-gen: current UTC hour, plus earlier schedule hours today
 * (catch-up if the bot was down / disabled during that hour).
 */
function dueScheduleHours(hours: number[], now: Date): number[] {
  const currentHour = now.getUTCHours();
  return hours.filter((h) => h <= currentHour);
}

let lastTwitterSkipLogAt = 0;

/**
 * Cron tick:
 * - When win flyers enabled: at each schedule hour, post a bucket flyer (🔥 caption).
 * - Else: AI stats text drafts at schedule hours.
 * - Catch-up for missed earlier hours today (slot_key dedupes).
 * - Always drain approved/due posts.
 */
export async function runTwitterSocialTick(): Promise<void> {
  const settings = await ensureTwitterSettings();
  const now = new Date();
  const xReady = twitterCredentialsConfigured();
  const metaReady = metaCredentialsConfigured();
  const anySocial = xReady || metaReady;

  if (!settings) {
    if (now.getTime() - lastTwitterSkipLogAt > 15 * 60_000) {
      lastTwitterSkipLogAt = now.getTime();
      logger.warn('twitter tick skipped: twitter_settings missing — run migration');
    }
    return;
  }

  const gates = effectiveTwitterGates(settings);
  if (!gates.enabled) {
    if (now.getTime() - lastTwitterSkipLogAt > 15 * 60_000) {
      lastTwitterSkipLogAt = now.getTime();
      logger.info('twitter tick skipped: auto-post disabled (Admin toggle or set X_SOCIAL_AUTO_PUBLISH=true)');
    }
    return;
  }

  const hours = normalizeHours(settings.post_hours_utc, settings.posts_per_day);
  const dueHours = dueScheduleHours(hours, now);

  if (dueHours.length === 0) {
    // Before first schedule hour today — nothing to generate yet.
  } else {
    for (const hour of dueHours) {
      // Full auto = win flyer with performance PNG (stats-only tweets only if flyers off).
      const useFlyer = settings.win_flyer_enabled || twitterAutoPublishForced();
      if (useFlyer) {
        const slotKey = utcWinFlyerSlotKey(now, hour);
        const gen = await generateWinFlyerDraft({ slotKey });
        if (gen.ok && gen.post && !gates.requireApproval && anySocial) {
          await publishTwitterPost(gen.post.id);
        } else if (gen.ok && gen.post && !anySocial) {
          logger.warn('social draft ready but X/Meta credentials missing on bot-service');
        } else if (gen.ok && gen.post && gates.requireApproval) {
          logger.info('twitter draft waiting for approval', { id: gen.post.id, slotKey });
        } else if (!gen.ok && gen.error) {
          logger.warn('twitter generate failed', { error: gen.error, slotKey });
        }
      } else {
        const slotKey = utcSlotKey(now, hour);
        const gen = await generateTwitterDraft({ source: 'auto', slotKey });
        if (gen.ok && gen.post && !gates.requireApproval && xReady) {
          await publishTwitterPost(gen.post.id);
        } else if (gen.ok && gen.post && !xReady) {
          logger.warn('twitter draft ready but X API credentials missing on bot-service');
        } else if (gen.ok && gen.post && gates.requireApproval) {
          logger.info('twitter draft waiting for approval', { id: gen.post.id, slotKey });
        } else if (!gen.ok && gen.error) {
          logger.warn('twitter generate failed', { error: gen.error, slotKey });
        }
      }
    }
  }

  if (!anySocial) {
    if (now.getTime() - lastTwitterSkipLogAt > 15 * 60_000) {
      lastTwitterSkipLogAt = now.getTime();
      logger.warn(
        'social publish skipped: set X_API_* and/or META_PAGE_ID + META_PAGE_ACCESS_TOKEN + META_IG_USER_ID on Railway'
      );
    }
    return;
  }

  // Approval was on historically → drafts never left the queue. Auto mode promotes + drains them.
  // Also retry recent `failed` (e.g. X "credits depleted") once keys/billing recover.
  if (!gates.requireApproval) {
    const nowIso = now.toISOString();
    const { data: drafts } = await supabase
      .from('twitter_posts')
      .select('id')
      .eq('status', 'draft')
      .order('created_at', { ascending: true })
      .limit(20);
    const draftIds = (drafts ?? []).map((d) => d.id);
    if (draftIds.length > 0) {
      await supabase
        .from('twitter_posts')
        .update({
          status: 'approved',
          approved_at: nowIso,
          approved_by: 'auto',
          scheduled_for: nowIso,
          updated_at: nowIso,
          error: null,
        })
        .in('id', draftIds);
    }
  }

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

  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
  const { data: dueFailed } = await supabase
    .from('twitter_posts')
    .select('id,error')
    .eq('status', 'failed')
    .gte('created_at', dayStart)
    .order('created_at', { ascending: true })
    .limit(5);

  const seen = new Set<string>();
  for (const row of [...(dueNull ?? []), ...(dueTimed ?? []), ...(dueFailed ?? [])]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const pub = await publishTwitterPost(row.id);
    if (!pub.ok && pub.error) {
      logger.warn('twitter publish attempt failed', { id: row.id, error: pub.error });
    }
  }
}

export async function getTwitterHealthSnapshot(): Promise<{
  credentialsConfigured: boolean;
  metaConfigured: boolean;
  adminSecretConfigured: boolean;
  autoPublishForced: boolean;
  enabled: boolean | null;
  requireApproval: boolean | null;
  winFlyerEnabled: boolean | null;
  postHoursUtc: number[] | null;
  lastGeneratedAt: string | null;
  lastPostedAt: string | null;
  lastFailedAt: string | null;
  lastFailedError: string | null;
  pendingApproved: number;
  failedToday: number;
  settingsMissing: boolean;
  currentHourUtc: number;
  dueNow: boolean;
}> {
  const settings = await loadTwitterSettings();
  const hours = settings
    ? normalizeHours(settings.post_hours_utc, settings.posts_per_day)
    : null;
  const currentHourUtc = new Date().getUTCHours();
  const gates = settings ? effectiveTwitterGates(settings) : null;

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [{ data: lastFail }, { count: pendingApproved }, { count: failedToday }] =
    await Promise.all([
      supabase
        .from('twitter_posts')
        .select('error, updated_at, created_at')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('twitter_posts')
        .select('id', { count: 'exact', head: true })
        .in('status', ['approved', 'scheduled', 'draft']),
      supabase
        .from('twitter_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', dayStart.toISOString()),
    ]);

  return {
    credentialsConfigured: twitterCredentialsConfigured(),
    metaConfigured: metaCredentialsConfigured(),
    adminSecretConfigured: Boolean(config.botAdminSecret),
    autoPublishForced: twitterAutoPublishForced(),
    enabled: gates ? gates.enabled : null,
    requireApproval: gates ? gates.requireApproval : null,
    winFlyerEnabled: settings ? Boolean(settings.win_flyer_enabled) : null,
    postHoursUtc: hours,
    lastGeneratedAt: settings?.last_generated_at ?? null,
    lastPostedAt: settings?.last_posted_at ?? null,
    lastFailedAt: lastFail?.updated_at ?? lastFail?.created_at ?? null,
    lastFailedError: lastFail?.error ?? null,
    pendingApproved: pendingApproved ?? 0,
    failedToday: failedToday ?? 0,
    settingsMissing: !settings,
    currentHourUtc,
    dueNow: Boolean(hours && hours.some((h) => h <= currentHourUtc) && gates?.enabled),
  };
}

export async function getTwitterAdminStatus(): Promise<{
  settings: TwitterSettings | null;
  credentialsConfigured: boolean;
  openaiConfigured: boolean;
  recent: TwitterPostRow[];
}> {
  const settings = await ensureTwitterSettings();
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
