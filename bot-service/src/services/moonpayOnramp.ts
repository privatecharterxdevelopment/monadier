import crypto from 'crypto';

/**
 * MoonPay on-ramp URL for native USDC on Arbitrum.
 * walletAddress requires HMAC signature with the secret key.
 * @see https://dev.moonpay.com/widget/on-ramp/customization/url-signing
 */

const PUBLISHABLE = () => (process.env.MOONPAY_API_KEY || process.env.VITE_MOONPAY_API_KEY || '').trim();
const SECRET = () => (process.env.MOONPAY_SECRET_KEY || '').trim();

export function moonpayConfigured(): boolean {
  return Boolean(PUBLISHABLE());
}

export function moonpaySigningReady(): boolean {
  return Boolean(PUBLISHABLE() && SECRET());
}

export type MoonPayUrlParams = {
  walletAddress: string;
  theme?: 'light' | 'dark';
  language?: string;
  fiatAmount?: number;
};

function moonpayBase(apiKey: string): string {
  return apiKey.startsWith('pk_test')
    ? 'https://buy-sandbox.moonpay.com'
    : 'https://buy.moonpay.com';
}

/** Build query string with values URL-encoded (required for valid signature). */
function buildSignedMoonPayUrl(params: MoonPayUrlParams): string {
  const apiKey = PUBLISHABLE();
  const secret = SECRET();
  if (!apiKey || !secret) {
    throw new Error('MoonPay keys not configured (MOONPAY_API_KEY + MOONPAY_SECRET_KEY)');
  }

  const q = new URLSearchParams();
  q.set('apiKey', apiKey);
  q.set('currencyCode', 'usdc_arbitrum');
  q.set('walletAddress', params.walletAddress);
  q.set('colorCode', '#3dd68c');
  q.set('theme', params.theme === 'dark' ? 'dark' : 'light');
  q.set('showAllCurrencies', 'false');
  q.set('enableRecurringBuys', 'false');
  if (params.fiatAmount && params.fiatAmount > 0) {
    q.set('baseCurrencyAmount', String(Math.round(params.fiatAmount)));
    q.set('baseCurrencyCode', 'usd');
  }
  if (params.language) q.set('language', params.language.slice(0, 2).toLowerCase());

  const query = `?${q.toString()}`;
  const signature = crypto.createHmac('sha256', secret).update(query).digest('base64');
  return `${moonpayBase(apiKey)}${query}&signature=${encodeURIComponent(signature)}`;
}

/** Unsigned widget — user pastes wallet in MoonPay. */
export function buildUnsignedMoonPayUrl(opts?: {
  theme?: 'light' | 'dark';
  language?: string;
  fiatAmount?: number;
}): string | null {
  const apiKey = PUBLISHABLE();
  if (!apiKey) return null;
  const q = new URLSearchParams({
    apiKey,
    defaultCurrencyCode: 'usdc_arbitrum',
    colorCode: '#3dd68c',
    theme: opts?.theme === 'dark' ? 'dark' : 'light',
  });
  if (opts?.fiatAmount && opts.fiatAmount > 0) {
    q.set('baseCurrencyAmount', String(Math.round(opts.fiatAmount)));
    q.set('baseCurrencyCode', 'usd');
  }
  if (opts?.language) q.set('language', opts.language.slice(0, 2).toLowerCase());
  return `${moonpayBase(apiKey)}?${q.toString()}`;
}

export function buildMoonPayBuyUrl(params: MoonPayUrlParams): {
  url: string;
  signed: boolean;
} {
  if (moonpaySigningReady() && /^0x[a-fA-F0-9]{40}$/.test(params.walletAddress)) {
    return { url: buildSignedMoonPayUrl(params), signed: true };
  }
  const unsigned = buildUnsignedMoonPayUrl(params);
  if (!unsigned) throw new Error('MoonPay publishable key missing');
  return { url: unsigned, signed: false };
}
