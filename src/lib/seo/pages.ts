import { SITE_NAME } from './site';
import { BETTING_KEYWORDS } from './bettingContent';

export type PageSeo = {
  path: string;
  title: string;
  description: string;
  keywords: string;
  changefreq: 'weekly' | 'monthly' | 'yearly';
  priority: number;
  /** Include in sitemap.xml */
  sitemap?: boolean;
  /** noindex for auth / utility pages */
  noindex?: boolean;
};

const BOT_KEYWORDS =
  'hyperliquid bot, hyperliquid trading bot, full auto trading bot, automated trading bot, passive income bot, crypto trading bot, hyperliquid perpetuals bot, non-custodial trading bot';

export const PAGE_SEO: Record<string, PageSeo> = {
  '/': {
    path: '/',
    title: `${SITE_NAME} | Hyperliquid Trading Bot — Full Auto 24/7`,
    description:
      'Monadier is a full auto Hyperliquid trading bot. Deposit USDC on HL, approve the agent once, and let the bot scan 200+ perpetual markets 24/7 — non-custodial, passive income automation.',
    keywords: `${BOT_KEYWORDS}, Monadier, Hyperliquid automated trading, DeFi trading bot`,
    changefreq: 'weekly',
    priority: 1.0,
    sitemap: true,
  },
  '/trading-bot': {
    path: '/trading-bot',
    title: `Hyperliquid Trading Bot | Full Auto 24/7 — ${SITE_NAME}`,
    description:
      'Automated Hyperliquid trading bot that executes 24/7 across 200+ perp markets. Connect wallet, fund HL with USDC, approve agent, start bot — full auto trading with you in control.',
    keywords: `${BOT_KEYWORDS}, 24/7 crypto bot, algorithmic Hyperliquid trading`,
    changefreq: 'weekly',
    priority: 1.0,
    sitemap: true,
  },
  '/how-it-works': {
    path: '/how-it-works',
    title: `How the Hyperliquid Bot Works | ${SITE_NAME}`,
    description:
      "Learn how Monadier's non-custodial Hyperliquid trading bot works: wallet connect, USDC deposit on Arbitrum, agent approval, and 24/7 full auto execution on Hyperliquid.",
    keywords: `how hyperliquid bot works, hyperliquid agent approval, USDC Arbitrum Hyperliquid, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.85,
    sitemap: true,
  },
  '/pricing': {
    path: '/pricing',
    title: `Trading Bot Pricing & Fees | ${SITE_NAME}`,
    description:
      'No platform subscription for the Hyperliquid trading bot. Gas covered on Arbitrum; pay a 10% success fee only on profitable closes. Transparent pricing for full auto trading.',
    keywords: `hyperliquid bot fees, trading bot pricing, no subscription trading bot, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.8,
    sitemap: true,
  },
  '/sports-betting': {
    path: '/sports-betting',
    title: `Hyperliquid Sports Betting & Prediction Markets | ${SITE_NAME}`,
    description:
      'Bet on sports, World Cup, basketball, and crypto events on Hyperliquid HIP-4 outcome markets. Non-custodial on-chain sports betting with live odds, wallet-signed orders, and transparent settlement.',
    keywords: `${BETTING_KEYWORDS}, hyperliquid prediction markets, on-chain betting platform, Monadier`,
    changefreq: 'weekly',
    priority: 0.85,
    sitemap: true,
  },
  '/technology': {
    path: '/technology',
    title: `Trading Bot Technology & Infrastructure | ${SITE_NAME}`,
    description:
      'How Monadier powers full auto Hyperliquid trading: multi-timeframe signals, non-custodial agent execution, live charts, and 24/7 server-side automation.',
    keywords: `hyperliquid bot technology, automated trading infrastructure, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.7,
    sitemap: true,
  },
  '/about': {
    path: '/about',
    title: `About ${SITE_NAME} | Hyperliquid Automated Trading`,
    description:
      'Monadier builds non-custodial automated trading tools for Hyperliquid — full auto trading bot, live terminal, and on-chain sports markets in one platform.',
    keywords: `about Monadier, hyperliquid trading platform, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.65,
    sitemap: true,
  },
  '/support': {
    path: '/support',
    title: `Support & FAQ | ${SITE_NAME} Trading Bot`,
    description:
      'Get help with the Monadier Hyperliquid trading bot — deposits, agent approval, bot settings, fees, and withdrawals. Contact support@monadier.io.',
    keywords: `hyperliquid bot support, trading bot help, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.6,
    sitemap: true,
  },
  '/terms': {
    path: '/terms',
    title: `Terms of Service | ${SITE_NAME}`,
    description: 'Terms of service for Monadier automated Hyperliquid trading software.',
    keywords: 'Monadier terms',
    changefreq: 'yearly',
    priority: 0.3,
    sitemap: true,
  },
  '/privacy': {
    path: '/privacy',
    title: `Privacy Policy | ${SITE_NAME}`,
    description: 'Privacy policy for Monadier — Hyperliquid trading bot and platform.',
    keywords: 'Monadier privacy',
    changefreq: 'yearly',
    priority: 0.3,
    sitemap: true,
  },
  '/login': {
    path: '/login',
    title: `Sign In | ${SITE_NAME}`,
    description: 'Sign in to your Monadier account to access the Hyperliquid trading bot terminal.',
    keywords: BOT_KEYWORDS,
    changefreq: 'monthly',
    priority: 0.2,
    sitemap: false,
    noindex: true,
  },
  '/register': {
    path: '/register',
    title: `Create Account | ${SITE_NAME}`,
    description: 'Create a Monadier account and start the full auto Hyperliquid trading bot.',
    keywords: BOT_KEYWORDS,
    changefreq: 'monthly',
    priority: 0.2,
    sitemap: false,
    noindex: true,
  },
};

export function getPageSeo(pathname: string): PageSeo {
  const path = pathname.split('?')[0].split('#')[0] || '/';
  return (
    PAGE_SEO[path] ?? {
      path,
      title: `${SITE_NAME} | Hyperliquid Trading Bot`,
      description: PAGE_SEO['/'].description,
      keywords: BOT_KEYWORDS,
      changefreq: 'monthly',
      priority: 0.5,
      sitemap: false,
    }
  );
}

export function getSitemapEntries(): PageSeo[] {
  return Object.values(PAGE_SEO)
    .filter((p) => p.sitemap !== false)
    .sort((a, b) => b.priority - a.priority);
}
