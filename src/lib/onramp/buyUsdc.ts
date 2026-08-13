/**
 * Fiat → Arbitrum USDC on-ramp (card / Apple Pay via MoonPay or Ramp).
 * Destination is always the connected wallet on Arbitrum One.
 */

import { fetchBotApi } from '../botApiFetch';

export type OnrampProvider = 'moonpay' | 'ramp';

export function getOnrampProvider(): OnrampProvider {
  const raw = (import.meta.env.VITE_ONRAMP_PROVIDER as string | undefined)?.trim().toLowerCase();
  return raw === 'ramp' ? 'ramp' : 'moonpay';
}

export function getMoonPayApiKey(): string {
  return (import.meta.env.VITE_MOONPAY_API_KEY as string | undefined)?.trim() || '';
}

export function getRampHostApiKey(): string {
  return (import.meta.env.VITE_RAMP_HOST_API_KEY as string | undefined)?.trim() || '';
}

/** Client can open buy UI; widget URL comes from bot-service (signed) or FE key. */
export function isOnrampConfigured(): boolean {
  if (getOnrampProvider() === 'ramp') return Boolean(getRampHostApiKey());
  return true;
}

/**
 * Prefer bot-service signed URL when available; otherwise client-side Ramp / unsigned MoonPay.
 */
export async function resolveOnrampBuyUrl(params: BuildOnrampUrlParams): Promise<{
  url: string | null;
  signed: boolean;
  needsPasteAddress: boolean;
}> {
  if (!params.walletAddress) {
    return { url: null, signed: false, needsPasteAddress: false };
  }

  if (getOnrampProvider() === 'ramp') {
    const url = buildRampBuyUrl(params);
    return { url, signed: false, needsPasteAddress: false };
  }

  try {
    const q = new URLSearchParams({
      wallet: params.walletAddress,
      theme: params.theme === 'dark' ? 'dark' : 'light',
      lang: (params.language || 'en').slice(0, 2),
    });
    if (params.fiatAmount && params.fiatAmount > 0) {
      q.set('amount', String(Math.round(params.fiatAmount)));
    }
    const res = await fetchBotApi(`/api/onramp/moonpay-url?${q.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; url?: string; signed?: boolean };
      if (data.success && data.url) {
        return {
          url: data.url,
          signed: Boolean(data.signed),
          needsPasteAddress: !data.signed,
        };
      }
    }
  } catch {
    /* fall through to client key */
  }

  const url = buildMoonPayBuyUrl(params);
  return {
    url,
    signed: false,
    needsPasteAddress: Boolean(url && params.walletAddress),
  };
}

export type BuildOnrampUrlParams = {
  walletAddress: string;
  /** Optional fiat amount hint */
  fiatAmount?: number;
  theme?: 'light' | 'dark';
  language?: string;
};

/** Client-only MoonPay URL (no wallet lock — paste address in widget unless signed via API). */
export function buildMoonPayBuyUrl(params: BuildOnrampUrlParams): string | null {
  const apiKey = getMoonPayApiKey();
  if (!apiKey) return null;

  const sandbox = apiKey.startsWith('pk_test');
  const base = sandbox ? 'https://buy-sandbox.moonpay.com' : 'https://buy.moonpay.com';
  const q = new URLSearchParams({
    apiKey,
    defaultCurrencyCode: 'usdc_arbitrum',
    colorCode: '#3dd68c',
    theme: params.theme === 'dark' ? 'dark' : 'light',
  });
  if (params.fiatAmount && params.fiatAmount > 0) {
    q.set('baseCurrencyAmount', String(Math.round(params.fiatAmount)));
    q.set('baseCurrencyCode', 'usd');
  }
  if (params.language) q.set('language', params.language.slice(0, 2));
  return `${base}?${q.toString()}`;
}

/** Ramp Network: ARBITRUM_USDC */
export function buildRampBuyUrl(params: BuildOnrampUrlParams): string | null {
  const hostApiKey = getRampHostApiKey();
  if (!hostApiKey || !params.walletAddress) return null;

  const q = new URLSearchParams({
    hostApiKey,
    swapAsset: 'ARBITRUM_USDC',
    enabledFlows: 'ONRAMP',
    userAddress: params.walletAddress,
    hostAppName: 'HyperGain',
    hostLogoUrl: 'https://www.hypergain.io/images/brand/hypergain-logo.png',
    primaryColor: '3dd68c',
  });
  if (params.fiatAmount && params.fiatAmount > 0) {
    q.set('fiatValue', String(Math.round(params.fiatAmount)));
    q.set('fiatCurrency', 'USD');
  }
  return `https://app.ramp.network/?${q.toString()}`;
}

export function buildOnrampBuyUrl(params: BuildOnrampUrlParams): string | null {
  return getOnrampProvider() === 'ramp' ? buildRampBuyUrl(params) : buildMoonPayBuyUrl(params);
}

export function onrampProviderLabel(): string {
  return getOnrampProvider() === 'ramp' ? 'Ramp' : 'MoonPay';
}
