/**
 * Meta Graph API — Facebook Page photo + Instagram feed publish.
 * Same public flyer PNG URL for both (IG requires HTTPS image_url).
 */
import { config } from '../config';
import { logger } from '../utils/logger';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function metaCredentialsConfigured(): boolean {
  const m = config.meta;
  return Boolean(m.pageId && m.pageAccessToken && (m.igUserId || m.pageId));
}

export function metaInstagramConfigured(): boolean {
  const m = config.meta;
  return Boolean(m.pageAccessToken && m.igUserId);
}

export function metaFacebookConfigured(): boolean {
  const m = config.meta;
  return Boolean(m.pageAccessToken && m.pageId);
}

async function graphPost(
  path: string,
  params: Record<string, string>
): Promise<{ ok: boolean; id?: string; error?: string; raw?: unknown }> {
  const url = new URL(`${GRAPH}${path}`);
  const body = new URLSearchParams({
    ...params,
    access_token: config.meta.pageAccessToken,
  });
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    const raw = (await res.json()) as Record<string, unknown>;
    if (!res.ok || raw.error) {
      const errObj = raw.error as { message?: string } | undefined;
      const msg = errObj?.message || `HTTP ${res.status}`;
      return { ok: false, error: msg, raw };
    }
    const id = String(raw.id ?? raw.post_id ?? '');
    return { ok: true, id: id || undefined, raw };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Facebook Page feed photo from public URL. */
export async function postFacebookPhoto(opts: {
  imageUrl: string;
  caption: string;
}): Promise<{ ok: boolean; postId?: string; error?: string }> {
  if (!metaFacebookConfigured()) {
    return { ok: false, error: 'Meta Facebook credentials missing (META_PAGE_ID + META_PAGE_ACCESS_TOKEN)' };
  }
  const result = await graphPost(`/${config.meta.pageId}/photos`, {
    url: opts.imageUrl,
    caption: opts.caption,
    published: 'true',
  });
  if (!result.ok) {
    logger.warn('Meta FB photo post failed', { error: result.error });
    return { ok: false, error: result.error };
  }
  logger.info('Meta FB photo posted', { id: result.id });
  return { ok: true, postId: result.id };
}

/**
 * Instagram content publish (Business/Creator linked to Page).
 * 1) create media container  2) publish
 */
export async function postInstagramPhoto(opts: {
  imageUrl: string;
  caption: string;
}): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  if (!metaInstagramConfigured()) {
    return { ok: false, error: 'Meta Instagram credentials missing (META_IG_USER_ID + token)' };
  }
  const ig = config.meta.igUserId;
  const create = await graphPost(`/${ig}/media`, {
    image_url: opts.imageUrl,
    caption: opts.caption,
  });
  if (!create.ok || !create.id) {
    logger.warn('Meta IG container create failed', { error: create.error });
    return { ok: false, error: create.error ?? 'IG container failed' };
  }

  // IG sometimes needs a short wait before publish is ready
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2_000));
    const pub = await graphPost(`/${ig}/media_publish`, {
      creation_id: create.id,
    });
    if (pub.ok) {
      logger.info('Meta IG media published', { id: pub.id, container: create.id });
      return { ok: true, mediaId: pub.id ?? create.id };
    }
    const retryable = /not ready|in progress|FINI?SHED_STATUS/i.test(pub.error || '');
    if (!retryable && i >= 2) {
      logger.warn('Meta IG publish failed', { error: pub.error, container: create.id });
      return { ok: false, error: pub.error };
    }
  }
  return { ok: false, error: 'IG media_publish timed out' };
}

export async function publishWinFlyerToMeta(opts: {
  imageUrl: string;
  caption: string;
}): Promise<{
  facebook?: { ok: boolean; postId?: string; error?: string };
  instagram?: { ok: boolean; mediaId?: string; error?: string };
}> {
  const out: {
    facebook?: { ok: boolean; postId?: string; error?: string };
    instagram?: { ok: boolean; mediaId?: string; error?: string };
  } = {};

  if (metaFacebookConfigured()) {
    out.facebook = await postFacebookPhoto(opts);
  }
  if (metaInstagramConfigured()) {
    out.instagram = await postInstagramPhoto(opts);
  }
  return out;
}
