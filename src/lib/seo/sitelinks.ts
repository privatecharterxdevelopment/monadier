import { BRAND_APP_URL, BRAND_SITE_URL } from '../brand';

/**
 * Primary destinations for SiteNavigationElement JSON-LD / sitelink signals.
 * Matches the AL marketing nav + core product + Open App CTA.
 */
export type GoogleSitelink = {
  name: string;
  path: string;
  /** Absolute URL when the target is on the app host. */
  absoluteUrl?: string;
};

export const GOOGLE_SITELINKS: GoogleSitelink[] = [
  { name: 'Trading Agent', path: '/trading-bot' },
  { name: 'How it works', path: '/how-it-works' },
  { name: 'Leaderboard', path: '/leaderboard' },
  { name: 'Docs', path: '/docs' },
  { name: 'FAQs', path: '/faqs' },
  { name: 'Help center', path: '/support' },
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
