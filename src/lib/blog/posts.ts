/**
 * HyperGain marketing blog — static posts (Aave-style list + article pages).
 */

export type BlogCategory = 'Product' | 'Research' | 'Announcements';

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: BlogCategory;
  date: string; // ISO
  cover: string;
  /** Short accent for cover gradient (CSS color) */
  accent: string;
  body: string[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'introducing-hypergain',
    title: 'Introducing HyperGain',
    description:
      'A non-custodial AI trading agent on Hyperliquid — fund once, approve once, and let automation run 24/7 across 200+ perps.',
    category: 'Announcements',
    date: '2026-08-10',
    cover: '/images/blog/cover-introducing.svg',
    accent: '#3dd68c',
    body: [
      'HyperGain is built for people who want Hyperliquid perpetuals automation without handing over keys or babysitting charts.',
      'You keep USDC on your Hyperliquid account. After a one-time agent approval, Start bot scans markets around the clock and opens or closes with your risk settings.',
      'There are no promised returns. Leveraged crypto is high risk — only trade what you can afford to lose. Past leaderboard P/L does not predict future results.',
    ],
  },
  {
    slug: 'non-custodial-on-hyperliquid',
    title: 'Non-custodial by design',
    description:
      'Your USDC stays on Hyperliquid in your name. HyperGain never holds private keys — trading approval is not withdrawal permission.',
    category: 'Product',
    date: '2026-08-08',
    cover: '/images/blog/cover-custody.svg',
    accent: '#26a69a',
    body: [
      'Custody is the first question serious users ask. HyperGain does not take deposits into a company wallet.',
      'Funds live on Hyperliquid. The trading agent can place orders after you approve it once; it cannot withdraw. Withdrawals always require your wallet on HL.',
      'Fund with native USDC on Arbitrum One via the in-app Funds flow. Wrong chain or wrong USDC variant will not credit correctly.',
    ],
  },
  {
    slug: 'profit-trailing-explained',
    title: 'Profit trailing explained',
    description:
      'How HyperGain trails winners: arm when ROE turns green, ratchet behind the run, and cut on pullback — without inventing fake peaks.',
    category: 'Research',
    date: '2026-08-05',
    cover: '/images/blog/cover-trailing.svg',
    accent: '#5eead4',
    body: [
      'When a position is profitable, the agent can arm a trailing stop that follows favorable price and exits on a defined pullback.',
      'For longs, the trail sits below the high and ratchets up. For shorts, it sits above the low and ratchets down. The goal is to let winners run while locking progress.',
      'You can stop the agent anytime and close positions manually in the terminal. Per-position “let run” overrides trail for that book only when you turn it on.',
    ],
  },
  {
    slug: 'on-chain-leaderboard',
    title: 'Why the leaderboard is on-chain',
    description:
      'Closed Hyperliquid agent trades surface on the public leaderboard — masked on site, full addresses and fills on HypurrScan.',
    category: 'Product',
    date: '2026-07-28',
    cover: '/images/blog/cover-leaderboard.svg',
    accent: '#86efac',
    body: [
      'Marketing screenshots are easy to fake. HyperGain’s public leaderboard is wired to real Hyperliquid closes.',
      'Wallets are masked on the site for privacy; you can verify full addresses and fills on HypurrScan.',
      'Past results do not predict future performance. The board is transparency — not a yield promise.',
    ],
  },
  {
    slug: 'ai-sports-betting-on-hl',
    title: 'AI sports betting on Hyperliquid',
    description:
      'Same non-custodial HL account: outcome markets from spot balance, live odds, and settlement on-chain.',
    category: 'Product',
    date: '2026-07-20',
    cover: '/images/blog/cover-betting.svg',
    accent: '#34d399',
    body: [
      'HyperGain also surfaces Hyperliquid outcome markets for sports and macro events — funded from your HL spot balance.',
      'Pick Yes/No at live odds, track open bets, and cash out when liquidity allows, or hold to settlement.',
      'The model is the same as the trading agent: your funds stay on Hyperliquid; we provide the interface and automation layer.',
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function formatBlogDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
