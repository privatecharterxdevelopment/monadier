/** Marketing copy for /leaderboard landing page. */
export const LEADERBOARD_PAGE = {
  eyebrow: 'On-chain proof',
  title: 'Leaderboard on chain',
  tagline: 'A bot for the people.',
  description:
    'No hidden tricks. No custody of your keys. Simple technology — platform fees only when a bot trade closes in profit. Every win below is a real Hyperliquid close you can verify on HypurrScan.',
  tableMeta: 'Live · refreshes every 10s from Hyperliquid',
  tableEmpty: 'Profitable bot closes will appear here as users win — all verifiable on HypurrScan.',
  tableLoading: 'Loading verified trades…',
} as const;

export const LEADERBOARD_PAGE_FAQS = [
  {
    question: 'Is the leaderboard real?',
    answer:
      'Yes. Rows come from closed Hyperliquid bot trades recorded in our system. Wallet labels are masked; full addresses are public on HypurrScan where you can verify fills and P/L.',
  },
  {
    question: 'When do platform fees apply?',
    answer:
      'Only on successful bot closes — not on deposits, losses, or manual trades. You keep trading until fees are due; pay on Arbitrum USDC when prompted.',
  },
] as const;
