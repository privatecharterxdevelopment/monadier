/** Shared marketing nav — labels via i18n keys in `nav.*`. */
export const LANDING_NAV_LINKS = [
  { to: '/how-it-works', labelKey: 'nav.howItWorks' },
  { to: '/trading-bot', labelKey: 'nav.bot' },
  { to: '/leaderboard', labelKey: 'nav.leaderboard' },
  { to: '/sports-betting', labelKey: 'nav.betting' },
  { to: '/technology', labelKey: 'nav.technology' },
  { to: '/pricing', labelKey: 'nav.pricing' },
] as const;

export const LANDING_FOOTER_LINKS = [
  { to: '/terms', labelKey: 'footer.terms' },
  { to: '/privacy', labelKey: 'footer.privacy' },
  { to: '/support', labelKey: 'footer.support' },
  { to: '/about', labelKey: 'footer.about' },
] as const;
