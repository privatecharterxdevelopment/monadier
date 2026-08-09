/** SEO content for /ai-sports-betting — English marketing copy only. */

export type BettingFaq = { q: string; a: string };

export const BETTING_KEYWORDS =
  'hyperliquid sports betting, on-chain sports betting, crypto sports betting, prediction markets hyperliquid, HIP-4 outcome markets, hyperliquid betting odds, non-custodial sports betting, bet on world cup crypto';

export const BETTING_FAQS: BettingFaq[] = [
  {
    q: 'What is Hyperliquid sports betting on HyperGain?',
    a: 'HyperGain lets you bet on sports and event outcome markets listed as Hyperliquid HIP-4 contracts. Odds update on-chain, orders are wallet-signed, and your USDC stays on your Hyperliquid account.',
  },
  {
    q: 'Is crypto sports betting on HyperGain non-custodial?',
    a: 'Yes. Your USDC remains on your Hyperliquid account. HyperGain never holds private keys — you sign bets and manage funds through your wallet.',
  },
  {
    q: 'What sports can I bet on?',
    a: 'Live and upcoming events on Hyperliquid outcome markets — football, basketball, World Cup, crypto price events, macro markets, and more as HIP-4 listings go live.',
  },
  {
    q: 'How do HIP-4 outcome markets work?',
    a: 'Each market is a Yes/No outcome contract on Hyperliquid. You buy shares at live odds, can sell early when liquidity is available, or hold until verified settlement.',
  },
  {
    q: 'How fast is on-chain betting execution?',
    a: 'Orders route to Hyperliquid outcome markets with wallet-signed execution. Open positions, cash out, and track P/L in the HyperGain app.',
  },
  {
    q: 'Do I need a separate account for sports betting?',
    a: 'No — the same Hyperliquid account and USDC balance powers sports betting and the HyperGain trading bot in one terminal.',
  },
  {
    q: 'Are betting odds transparent?',
    a: 'Yes. Odds move on-chain as the book updates. Positions and balances are visible on Hyperliquid — not a hidden bookmaker ledger.',
  },
  {
    q: 'Can I use the trading bot and sports betting together?',
    a: 'Yes. HyperGain combines automated Hyperliquid perpetuals trading and on-chain sports markets in one platform with one HL account.',
  },
];

export const BETTING_BENEFITS = [
  {
    title: 'On-chain odds',
    text: 'Live HIP-4 prices refresh on Hyperliquid — transparent books, not opaque off-chain lines.',
  },
  {
    title: 'Wallet-signed bets',
    text: 'Every order is signed by your wallet. HyperGain never custodies your USDC or keys.',
  },
  {
    title: 'Cash out early',
    text: 'Sell Yes/No shares before settlement when market liquidity allows.',
  },
  {
    title: 'One HL account',
    text: 'Same USDC balance for sports markets and the HyperGain trading bot terminal.',
  },
] as const;
