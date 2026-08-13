/** Marketing copy for /leaderboard landing page. */
export const LEADERBOARD_PAGE = {
  eyebrow: 'On-chain proof',
  title: 'Leaderboard on chain',
  tagline: 'An agent for the people.',
  description:
    'Live Hyperliquid L1 fills from our users. Masked wallets here — tap HypurrScan to verify the exact close. No hidden tricks. Platform fees only when an agent trade closes in profit.',
  tableMeta: 'Live Hyperliquid L1 · refreshes every 10s',
  tableEmpty: 'Agent closes appear here as Hyperliquid fills land — wins and losses, verifiable on HypurrScan.',
  tableLoading: 'Loading Hyperliquid fills…',
} as const;

export const LEADERBOARD_PAGE_FAQS = [
  {
    q: 'Is the leaderboard real?',
    a: 'Yes. Rows are live Hyperliquid L1 fills (userFills) for HyperGain agent wallets — not a private database. Wallets are masked on this page; HypurrScan shows the full address, fill, and P/L. Past results do not predict future performance.',
  },
  {
    q: 'When do platform fees apply?',
    a: 'Only on successful agent closes — not on deposits, losses, or manual trades. You keep trading until fees are due; pay on Arbitrum USDC when prompted. See Terms of Service for current fee terms.',
  },
] as const;
