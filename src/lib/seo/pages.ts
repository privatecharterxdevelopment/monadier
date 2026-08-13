import { SITE_NAME } from './site';
import { BETTING_KEYWORDS } from './bettingContent';

export type PageSeo = {
  path: string;
  title: string;
  description: string;
  keywords: string;
  changefreq: 'weekly' | 'monthly' | 'yearly';
  priority: number;
  /** Include in public/sitemap.xml — only primary marketing URLs */
  sitemap?: boolean;
  /** noindex for secondary / auth / utility pages */
  noindex?: boolean;
};

const BOT_KEYWORDS =
  'hyperliquid agent, hyperliquid trading agent, full auto AI trading agent, automated trading agent, crypto trading agent, hyperliquid perpetuals agent, non-custodial trading agent';

/**
 * Indexable primary pages (AL nav + home + product + legal):
 * /, /trading-bot, /how-it-works, /leaderboard, /docs, /faqs, /support, /terms, /privacy
 *
 * Everything else is noindex (secondary product, thin pages, auth).
 */
export const PAGE_SEO: Record<string, PageSeo> = {
  '/': {
    path: '/',
    title: `HyperGain - full-auto AI trading agent on hyperliquid 24/7`,
    description:
      'HyperGain - full-auto AI trading agent on Hyperliquid 24/7. Automated perps, USDC on Arbitrum, 200+ markets, non-custodial. No guaranteed returns.',
    keywords: `${BOT_KEYWORDS}, HyperGain, Hyperliquid automated trading, DeFi trading agent`,
    changefreq: 'weekly',
    priority: 1.0,
    sitemap: true,
  },
  '/trading-bot': {
    path: '/trading-bot',
    title: `Hyperliquid Trading Agent | Full Auto 24/7 — ${SITE_NAME}`,
    description:
      'Hands-off Hyperliquid automation across 200+ perps. Fund HL USDC (min. $5 deposit, $20+ to run the agent), approve once, trail when profitable. Non-custodial — no guaranteed returns.',
    keywords: `${BOT_KEYWORDS}, AI trading agent, 24/7 crypto agent, algorithmic Hyperliquid trading`,
    changefreq: 'weekly',
    priority: 1.0,
    sitemap: true,
  },
  '/buy-crypto': {
    path: '/buy-crypto',
    title: `Buy USDC with card | MoonPay on Arbitrum — ${SITE_NAME}`,
    description:
      'Buy USDC with Visa, Mastercard or Apple Pay via MoonPay. Connect wallet, fund on Arbitrum, then register and start the HyperGain Hyperliquid agent.',
    keywords: `buy USDC card, MoonPay Hyperliquid, buy crypto Arbitrum USDC, HyperGain on-ramp, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.8,
    sitemap: true,
  },
  '/how-it-works': {
    path: '/how-it-works',
    title: `How it works | Deposit, Approve, Trade 24/7 — ${SITE_NAME}`,
    description:
      'How HyperGain works: deposit USDC on Hyperliquid, pick 2 or 3 slots, start the agent. No API keys. Intelligent trailing stop in profit. Withdraw anytime.',
    keywords: `how hyperliquid agent works, hypergain agent settings, hyperliquid USDC deposit, trailing stop loss agent, 2 or 3 trade slots, no API trading agent, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.9,
    sitemap: true,
  },
  '/leaderboard': {
    path: '/leaderboard',
    title: `Leaderboard | On-Chain Hyperliquid Agent Closes — ${SITE_NAME}`,
    description:
      'Live Hyperliquid L1 leaderboard of agent closes. Masked wallets here, full addresses and fills on HypurrScan. Past results do not predict future performance.',
    keywords: `hyperliquid agent leaderboard, on-chain trading wins, hypurrscan verify, ${BOT_KEYWORDS}`,
    changefreq: 'weekly',
    priority: 0.85,
    sitemap: true,
  },
  '/support': {
    path: '/support',
    title: `Help Center | Hyperliquid Agent Support — ${SITE_NAME}`,
    description:
      'HyperGain help center — deposits, agent approval, agent settings, fees, and withdrawals. Contact administration@hypergain.io. Support available 24/7.',
    keywords: `hyperliquid agent support, HyperGain help center, trading agent help, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.8,
    sitemap: true,
  },
  '/docs': {
    path: '/docs',
    title: `Docs | Hyperliquid AI Trading Agent Documentation — ${SITE_NAME}`,
    description:
      'HyperGain documentation — getting started, non-custodial funds, profit trailing, fees, leaderboard, and AI sports betting on Hyperliquid.',
    keywords: `HyperGain docs, hyperliquid trading agent documentation, AI trading agent guide, ${BOT_KEYWORDS}`,
    changefreq: 'weekly',
    priority: 0.75,
    sitemap: true,
  },
  '/terms': {
    path: '/terms',
    title: `Terms of Service | ${SITE_NAME}`,
    description: 'Terms of service for HyperGain automated Hyperliquid trading software.',
    keywords: 'HyperGain terms of service',
    changefreq: 'yearly',
    priority: 0.2,
    sitemap: true,
  },
  '/privacy': {
    path: '/privacy',
    title: `Privacy Policy | ${SITE_NAME}`,
    description: 'Privacy policy for HyperGain — Hyperliquid trading agent and platform.',
    keywords: 'HyperGain privacy policy',
    changefreq: 'yearly',
    priority: 0.2,
    sitemap: true,
  },

  /* ——— Secondary marketing: crawlable but not indexed ——— */
  '/ai-sports-betting': {
    path: '/ai-sports-betting',
    title: `AI Sports Betting | Hyperliquid Sports Markets — ${SITE_NAME}`,
    description:
      'AI sports betting on Hyperliquid HIP-4 sports and prediction markets. Non-custodial on-chain bets with live odds and wallet-signed orders.',
    keywords: `${BETTING_KEYWORDS}, AI sports betting, hyperliquid prediction markets, HyperGain`,
    changefreq: 'monthly',
    priority: 0.3,
    sitemap: false,
    noindex: true,
  },
  '/pricing': {
    path: '/pricing',
    title: `Pricing | Agent Fees — ${SITE_NAME}`,
    description:
      'HyperGain pricing for the Hyperliquid trading agent. No monthly subscription — platform fees as disclosed in Terms.',
    keywords: `hyperliquid agent fees, trading agent pricing, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.3,
    sitemap: false,
    noindex: true,
  },
  '/technology': {
    path: '/technology',
    title: `Technology | ${SITE_NAME}`,
    description:
      'How HyperGain powers full auto Hyperliquid trading: multi-timeframe signals, non-custodial agent execution, and 24/7 automation.',
    keywords: `hyperliquid agent technology, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.2,
    sitemap: false,
    noindex: true,
  },
  '/faqs': {
    path: '/faqs',
    title: `FAQs | ${SITE_NAME}`,
    description: 'HyperGain FAQs — deposits, agent approval, agent trading, fees, and withdrawals.',
    keywords: `HyperGain FAQ, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.75,
    sitemap: true,
  },
  '/contact': {
    path: '/contact',
    title: `Contact | ${SITE_NAME}`,
    description: 'Contact HyperGain at administration@hypergain.io.',
    keywords: `HyperGain contact, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.2,
    sitemap: false,
    noindex: true,
  },
  '/about': {
    path: '/about',
    title: `About | ${SITE_NAME}`,
    description: 'About HyperGain — non-custodial Hyperliquid automation.',
    keywords: `about HyperGain, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },
  '/card': {
    path: '/card',
    title: `Card | ${SITE_NAME}`,
    description: 'HyperGain card information.',
    keywords: BOT_KEYWORDS,
    changefreq: 'yearly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },
  '/forex': {
    path: '/forex',
    title: `Forex | ${SITE_NAME}`,
    description: 'HyperGain forex information.',
    keywords: BOT_KEYWORDS,
    changefreq: 'yearly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },
  '/app': {
    path: '/app',
    title: `Open App | ${SITE_NAME}`,
    description: 'Open the HyperGain trading terminal.',
    keywords: BOT_KEYWORDS,
    changefreq: 'monthly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },

  /* ——— Auth / utility ——— */
  '/login': {
    path: '/login',
    title: `Sign In | ${SITE_NAME}`,
    description: 'Sign in to your HyperGain account.',
    keywords: BOT_KEYWORDS,
    changefreq: 'monthly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },
  '/register': {
    path: '/register',
    title: `Create Account | ${SITE_NAME}`,
    description: 'Create a HyperGain account.',
    keywords: BOT_KEYWORDS,
    changefreq: 'monthly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },
  '/forgot-password': {
    path: '/forgot-password',
    title: `Forgot Password | ${SITE_NAME}`,
    description: 'Reset your HyperGain password.',
    keywords: BOT_KEYWORDS,
    changefreq: 'yearly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },
  '/reset-password': {
    path: '/reset-password',
    title: `Reset Password | ${SITE_NAME}`,
    description: 'Choose a new HyperGain password.',
    keywords: BOT_KEYWORDS,
    changefreq: 'yearly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },
  '/kyc': {
    path: '/kyc',
    title: `Verification | ${SITE_NAME}`,
    description: 'Account verification.',
    keywords: BOT_KEYWORDS,
    changefreq: 'yearly',
    priority: 0.1,
    sitemap: false,
    noindex: true,
  },
};

export function getPageSeo(pathname: string): PageSeo {
  const path = pathname.split('?')[0].split('#')[0] || '/';
  return (
    PAGE_SEO[path] ?? {
      path,
      title: `Hyperliquid Trading Agent — ${SITE_NAME}`,
      description: PAGE_SEO['/'].description,
      keywords: BOT_KEYWORDS,
      changefreq: 'monthly',
      priority: 0.1,
      sitemap: false,
      noindex: true,
    }
  );
}

/** Entries for public/sitemap.xml — keep that file in sync when changing this list. */
export function getSitemapEntries(): PageSeo[] {
  return Object.values(PAGE_SEO)
    .filter((p) => p.sitemap === true && !p.noindex)
    .sort((a, b) => b.priority - a.priority);
}
