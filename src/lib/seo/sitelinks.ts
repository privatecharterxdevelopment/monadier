import { BRAND_APP_URL, BRAND_SITE_URL } from '../brand';

/**
 * Desired Google sitelinks under the HyperGain brand result.
 * Google generates sitelinks automatically — this list drives nav anchors,
 * SiteNavigationElement JSON-LD, and sitemap priority so Google has a clear
 * signal. Exact labels/order are not guaranteed.
 */
export type GoogleSitelink = {
  name: string;
  path: string;
  /** Absolute URL when the target is on the app host (Open App). */
  absoluteUrl?: string;
};

export const GOOGLE_SITELINKS: GoogleSitelink[] = [
  { name: 'AI Trading Bot', path: '/trading-bot' },
  { name: 'AI Sports Betting', path: '/ai-sports-betting' },
  {
    name: 'Perps Trading',
    path: '/app',
    absoluteUrl: `${BRAND_APP_URL}/?section=perps`,
  },
  { name: 'How it works', path: '/how-it-works' },
  { name: 'Pricing', path: '/pricing' },
  {
    name: 'Open App',
    path: '/app',
    absoluteUrl: BRAND_APP_URL,
  },
];

export function sitelinkUrl(link: GoogleSitelink): string {
  if (link.absoluteUrl) return link.absoluteUrl.replace(/\/$/, '') || BRAND_APP_URL;
  return `${BRAND_SITE_URL}${link.path}`;
}
