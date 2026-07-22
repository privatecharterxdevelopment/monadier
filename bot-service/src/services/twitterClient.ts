import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function buildOAuthHeader(method: string, url: string): string | null {
  const { apiKey, apiSecret, accessToken, accessSecret } = config.twitter;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;

  const oauth: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauth[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join('&');

  const signingKey = `${percentEncode(apiSecret)}&${percentEncode(accessSecret)}`;
  oauth.oauth_signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  return (
    'OAuth ' +
    Object.keys(oauth)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauth[k])}"`)
      .join(', ')
  );
}

export function twitterCredentialsConfigured(): boolean {
  const t = config.twitter;
  return Boolean(t.apiKey && t.apiSecret && t.accessToken && t.accessSecret);
}

/** Upload a PNG via X API v1.1 media endpoint (OAuth1). Returns media_id_string. */
export async function uploadMediaPng(png: Buffer): Promise<{
  ok: boolean;
  mediaId?: string;
  error?: string;
}> {
  if (!png.length) return { ok: false, error: 'Empty media buffer' };
  if (png.length > 5 * 1024 * 1024) {
    return { ok: false, error: 'PNG exceeds 5MB X upload limit' };
  }

  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const auth = buildOAuthHeader('POST', url);
  if (!auth) {
    return { ok: false, error: 'X API credentials missing on bot-service' };
  }

  try {
    const form = new FormData();
    form.append(
      'media',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'hypergain-flyer.png'
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: auth },
      body: form,
    });

    const raw = (await res.json().catch(() => ({}))) as {
      media_id_string?: string;
      media_id?: number;
      errors?: Array<{ message?: string }>;
      error?: string;
    };

    if (!res.ok) {
      const err =
        raw.errors?.[0]?.message ||
        raw.error ||
        `X media upload HTTP ${res.status}`;
      logger.warn('X media upload failed', { status: res.status, error: err });
      return { ok: false, error: err };
    }

    const mediaId = raw.media_id_string || (raw.media_id != null ? String(raw.media_id) : '');
    if (!mediaId) return { ok: false, error: 'X media upload returned no media id' };
    return { ok: true, mediaId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('X media upload request error', { error: msg });
    return { ok: false, error: msg };
  }
}

export async function postTweet(
  text: string,
  mediaIds?: string[]
): Promise<{
  ok: boolean;
  twitterId?: string;
  error?: string;
}> {
  const body = text.trim();
  if (!body) return { ok: false, error: 'Empty tweet' };
  if (body.length > 280) return { ok: false, error: `Tweet too long (${body.length}/280)` };

  const url = 'https://api.twitter.com/2/tweets';
  const auth = buildOAuthHeader('POST', url);
  if (!auth) {
    return { ok: false, error: 'X API credentials missing on bot-service' };
  }

  const payload: {
    text: string;
    media?: { media_ids: string[] };
  } = { text: body };
  const ids = (mediaIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  if (ids.length) {
    payload.media = { media_ids: ids.slice(0, 4) };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const raw = (await res.json().catch(() => ({}))) as {
      data?: { id?: string };
      detail?: string;
      title?: string;
      errors?: Array<{ message?: string }>;
    };

    if (!res.ok) {
      const err =
        raw.detail ||
        raw.title ||
        raw.errors?.[0]?.message ||
        `X API HTTP ${res.status}`;
      logger.warn('X tweet failed', { status: res.status, error: err });
      return { ok: false, error: err };
    }

    const twitterId = raw.data?.id;
    if (!twitterId) return { ok: false, error: 'X API returned no tweet id' };
    return { ok: true, twitterId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('X tweet request error', { error: msg });
    return { ok: false, error: msg };
  }
}
