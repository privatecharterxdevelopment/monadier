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

export async function postTweet(text: string): Promise<{
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

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: body }),
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
