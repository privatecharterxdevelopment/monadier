/** Shared marketing nav — labels via i18n keys in `nav.*`.
 * Ordered to match desired Google sitelinks (plus Open App CTA in the bar).
 */
export const LANDING_NAV_LINKS = [
  { to: '/trading-bot', labelKey: 'nav.aiTradingBot' },
  { to: '/ai-sports-betting', labelKey: 'nav.aiSportsBetting' },
  { to: '/how-it-works', labelKey: 'nav.howItWorks' },
  { to: '/pricing', labelKey: 'nav.pricing' },
] as const;

export const LANDING_FOOTER_LINKS = [
  { to: '/trading-bot', labelKey: 'nav.aiTradingBot' },
  { to: '/ai-sports-betting', labelKey: 'nav.aiSportsBetting' },
  { to: '/how-it-works', labelKey: 'nav.howItWorks' },
  { to: '/pricing', labelKey: 'nav.pricing' },
  { to: '/terms', labelKey: 'footer.terms' },
  { to: '/privacy', labelKey: 'footer.privacy' },
  { to: '/support', labelKey: 'footer.support' },
] as const;
