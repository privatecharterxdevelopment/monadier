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
  'hyperliquid bot, hyperliquid trading bot, full auto trading bot, automated trading bot, crypto trading bot, hyperliquid perpetuals bot, non-custodial trading bot';

export const PAGE_SEO: Record<string, PageSeo> = {
  '/': {
    path: '/',
    title: `${SITE_NAME} | Hyperliquid Trading Bot — Full Auto 24/7`,
    description:
      'HyperGain is a full auto Hyperliquid trading bot. Deposit USDC on HL, approve the agent once, and let the bot scan 200+ perpetual markets 24/7 — non-custodial automation. No guaranteed returns.',
    keywords: `${BOT_KEYWORDS}, HyperGain, Hyperliquid automated trading, DeFi trading bot`,
    changefreq: 'weekly',
    priority: 1.0,
    sitemap: true,
  },
  '/trading-bot': {
    path: '/trading-bot',
    title: `AI Trading Bot | Full Auto Hyperliquid — ${SITE_NAME}`,
    description:
      'AI trading bot for Hyperliquid: full auto 24/7 across 200+ perp markets. Non-custodial USDC on HL. No guaranteed returns — fees as disclosed in Terms (HL costs + optional Platform Success Fee).',
    keywords: `${BOT_KEYWORDS}, AI trading bot, 24/7 crypto bot, algorithmic Hyperliquid trading`,
    changefreq: 'weekly',
    priority: 1.0,
    sitemap: true,
  },
  '/ai-sports-betting': {
    path: '/ai-sports-betting',
    title: `AI Sports Betting | Hyperliquid Sports Markets — ${SITE_NAME}`,
    description:
      'AI sports betting on Hyperliquid HIP-4 sports and prediction markets. Non-custodial on-chain bets with live odds, wallet-signed orders, and transparent settlement.',
    keywords: `${BETTING_KEYWORDS}, AI sports betting, AI auto betting, hyperliquid prediction markets, on-chain betting platform, HyperGain`,
    changefreq: 'weekly',
    priority: 0.95,
    sitemap: true,
  },
  '/how-it-works': {
    path: '/how-it-works',
    title: `How it works | Hyperliquid Bot Setup — ${SITE_NAME}`,
    description:
      "Learn how HyperGain's non-custodial Hyperliquid trading bot works: wallet connect, USDC deposit on Arbitrum, agent approval, and 24/7 full auto execution on Hyperliquid.",
    keywords: `how hyperliquid bot works, hyperliquid agent approval, USDC Arbitrum Hyperliquid, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.85,
    sitemap: true,
  },
  '/pricing': {
    path: '/pricing',
    title: `Pricing | Bot Fees & Plans — ${SITE_NAME}`,
    description:
      'Transparent HyperGain pricing for the Hyperliquid trading bot and AI auto betting. See platform fees and how success fees work.',
    keywords: `hyperliquid bot fees, trading bot pricing, AI betting fees, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.85,
    sitemap: true,
  },
  '/app': {
    path: '/app',
    title: `Open App | HyperGain Trading Terminal`,
    description:
      'Open the HyperGain app — AI trading bot, Hyperliquid perps terminal, and AI auto betting in one place.',
    keywords: `open HyperGain app, hyperliquid trading terminal, ${BOT_KEYWORDS}`,
    changefreq: 'weekly',
    priority: 0.9,
    sitemap: true,
  },
  '/leaderboard': {
    path: '/leaderboard',
    title: `Leaderboard On Chain | Verified Bot Wins — ${SITE_NAME}`,
    description:
      'Live on-chain leaderboard of profitable Hyperliquid bot trades. Masked wallets, open and close times, P/L — verify every win on HypurrScan. A bot for the people: no keys, fees only on successful closes.',
    keywords: `hyperliquid bot leaderboard, on-chain trading wins, hypurrscan verify, ${BOT_KEYWORDS}`,
    changefreq: 'weekly',
    priority: 0.75,
    sitemap: true,
  },
  '/technology': {
    path: '/technology',
    title: `Trading Bot Technology & Infrastructure | ${SITE_NAME}`,
    description:
      'How HyperGain powers full auto Hyperliquid trading: multi-timeframe signals, non-custodial agent execution, live charts, and 24/7 server-side automation.',
    keywords: `hyperliquid bot technology, automated trading infrastructure, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.7,
    sitemap: true,
  },
  '/support': {
    path: '/support',
    title: `Support & FAQ | ${SITE_NAME} Trading Bot`,
    description:
      'Get help with the HyperGain Hyperliquid trading bot — deposits, agent approval, bot settings, fees, and withdrawals. Contact administration@hypergain.io.',
    keywords: `hyperliquid bot support, trading bot help, ${BOT_KEYWORDS}`,
    changefreq: 'monthly',
    priority: 0.6,
    sitemap: true,
  },
  '/terms': {
    path: '/terms',
    title: `Terms of Service | ${SITE_NAME}`,
    description: 'Terms of service for HyperGain automated Hyperliquid trading software.',
    keywords: 'HyperGain terms',
    changefreq: 'yearly',
    priority: 0.3,
    sitemap: true,
  },
  '/privacy': {
    path: '/privacy',
    title: `Privacy Policy | ${SITE_NAME}`,
    description: 'Privacy policy for HyperGain — Hyperliquid trading bot and platform.',
    keywords: 'HyperGain privacy',
    changefreq: 'yearly',
    priority: 0.3,
    sitemap: true,
  },
  '/login': {
    path: '/login',
    title: `Sign In | ${SITE_NAME}`,
    description: 'Sign in to your HyperGain account to access the Hyperliquid trading bot terminal.',
    keywords: BOT_KEYWORDS,
    changefreq: 'monthly',
    priority: 0.2,
    sitemap: false,
    noindex: true,
  },
  '/register': {
    path: '/register',
    title: `Create Account | ${SITE_NAME}`,
    description: 'Create a HyperGain account and start the full auto Hyperliquid trading bot.',
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
