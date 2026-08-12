/** Shared marketing nav — labels via i18n keys in `nav.*` / `common.*`.
 * Ordered to match AL header + Google sitelink candidates (see lib/seo/sitelinks.ts).
 */
export const LANDING_NAV_LINKS = [
  { to: '/support', labelKey: 'common.helpCenter' },
  { to: '/faqs', labelKey: 'footer.faqs' },
  { to: '/leaderboard', labelKey: 'common.leaderboard' },
  { to: '/how-it-works', labelKey: 'common.howItWorks' },
] as const;

export const LANDING_FOOTER_LINKS = [
  { to: '/trading-bot', labelKey: 'nav.aiTradingBot' },
  { to: '/how-it-works', labelKey: 'nav.howItWorks' },
  { to: '/leaderboard', labelKey: 'common.leaderboard' },
  { to: '/faqs', labelKey: 'footer.faqs' },
  { to: '/support', labelKey: 'footer.support' },
  { to: '/terms', labelKey: 'footer.terms' },
  { to: '/privacy', labelKey: 'footer.privacy' },
] as const;
