/** SEO-focused content for /trading-bot — English only (marketing). */

export type TradingBotFaq = { q: string; a: string };

export const TRADING_BOT_FAQS: TradingBotFaq[] = [
  {
    q: 'What is the HyperGain Hyperliquid trading bot?',
    a: 'HyperGain is a full auto trading bot for Hyperliquid perpetuals. You deposit USDC on your own Hyperliquid account, approve the HyperGain agent once, and the bot scans 200+ HL markets 24/7 to open and close trades automatically.',
  },
  {
    q: 'Is this a passive income trading bot?',
    a: 'The bot runs 24/7 on HyperGain servers while you are offline — but crypto trading is not guaranteed income. It automates execution; profits and losses depend on market conditions. Only use capital you can afford to lose.',
  },
  {
    q: 'Is the Hyperliquid bot non-custodial?',
    a: 'Yes. Your USDC stays on your Hyperliquid account in your name. HyperGain never holds your private keys. The approved agent can place trades but cannot withdraw funds without your wallet.',
  },
  {
    q: 'How much USDC do I need to start the bot?',
    a: 'At least $20 USDC on your Hyperliquid account to run the bot (HL minimum deposit is $5). Deposit native USDC on Arbitrum One only.',
  },
  {
    q: 'Can the trading bot run 24/7?',
    a: 'Yes. Once you press Start bot and your HL account is funded, the bot scans all Hyperliquid perpetuals around the clock. You do not need to keep your browser or computer open.',
  },
  {
    q: 'Which markets does the full auto bot trade?',
    a: 'Any active Hyperliquid perpetual with a valid signal — the bot loads the full HL universe (200+ pairs) and picks the strongest setup each cycle, not a fixed BTC/ETH list.',
  },
  {
    q: 'What fees does the Hyperliquid trading bot charge?',
    a: 'No platform subscription. HyperGain covers Arbitrum gas for bot trades. No HyperGain success fee on closes — standard Hyperliquid trading and funding fees apply.',
  },
  {
    q: 'Can I stop the bot or close trades manually?',
    a: 'Yes. Press Stop bot to halt new entries. Open positions remain until take profit, stop loss, or manual close in the HyperGain terminal.',
  },
  {
    q: 'Do I need trading experience to use the bot?',
    a: 'No PhD required — connect wallet, fund HL, approve agent, set risk parameters, and start. Leverage is optional and suited to experienced traders. Crypto perpetuals carry substantial risk.',
  },
  {
    q: 'How is HyperGain different from manual Hyperliquid trading?',
    a: 'HyperGain adds full auto execution, multi-timeframe signal scanning, dynamic trailing stops, and 24/7 monitoring in one terminal — while your funds stay non-custodial on Hyperliquid.',
  },
];

export const TRADING_BOT_BENEFITS = [
  {
    title: 'Full auto 24/7',
    text: 'The Hyperliquid trading bot scans every listed perp around the clock — no manual chart watching required.',
  },
  {
    title: 'Passive automation',
    text: 'Set your risk once, start the bot, and let server-side automation handle entries and exits while you sleep.',
  },
  {
    title: 'Non-custodial',
    text: 'USDC stays on your Hyperliquid account. Your wallet controls deposits, withdrawals, and the one-time agent approval.',
  },
  {
    title: '200+ HL markets',
    text: 'Not limited to BTC or ETH — the bot ranks the full Hyperliquid perpetual universe each cycle.',
  },
  {
    title: 'No subscription',
    text: 'No monthly platform fee and no HyperGain success fee on bot closes. Standard HL trading costs apply.',
  },
  {
    title: 'You stay in control',
    text: 'Start, stop, adjust TP/SL and leverage, close positions manually, or withdraw HL funds anytime.',
  },
] as const;

/** Three headline capabilities — /trading-bot cards row */
export const TRADING_BOT_CAPABILITIES = [
  {
    title: 'Scans 200+ HL perps',
    text: 'Every cycle ranks the full Hyperliquid perpetual universe — not a fixed BTC/ETH list — and picks the strongest setup for your slot.',
    icon: 'scan' as const,
  },
  {
    title: '14+ gates before open',
    text: 'Macro beta, volume, structure, pump-short, and location checks run before any trade — same pipeline as the live terminal.',
    icon: 'shield' as const,
  },
  {
    title: 'Trails profit 24/7',
    text: 'ATR-based trailing lets winners run while the bot cuts losers — server-side, even when your phone is locked.',
    icon: 'trend' as const,
  },
] as const;

export const TRADING_BOT_WALLET_BANNER = {
  eyebrow: 'One-click connect',
  title: 'Connect your preferred wallet',
} as const;

export const TRADING_BOT_RISK_BANNER = {
  eyebrow: 'Risk management',
  title: 'You set the guardrails',
  desc: 'Risk % controls margin per trade — not leverage. Cap LVRG, limit concurrent positions, and preview illustrative P/L before you press Start bot.',
} as const;

export const BOT_AUDIENCE_VIDEO_BANNER = {
  videoSrc: '/videos/6667321-uhd_4096_2160_25fps.mp4',
  lineOne: 'Focus on what matters',
  lineTwo: 'with a bot you can trust',
} as const;

export const BOT_PAGE_HERO = {
  title: 'Trading bot',
  rotateLines: ['200+ markets', 'runs 24/7', 'trails profits'],
  footer: 'on Hyperliquid',
  tagline: 'A bot built for passive income — transparent performance on-chain.',
  lead: 'Approve once, fund HL USDC, and let the agent scan every perpetual while you are offline.',
} as const;

export const BOT_PAGE_LEADERBOARD = {
  eyebrow: 'On-chain proof',
  title: 'Leaderboard',
  lead: 'Real Hyperliquid closes from bot wallets — wallet labels only, full addresses on HypurrScan.',
} as const;

export const TRADING_BOT_FEATURES = [
  {
    title: 'Multi-timeframe signals',
    text: 'Combines 5m through 1h structure to align entries with broader Hyperliquid trend context.',
  },
  {
    title: 'Dynamic trailing stops',
    text: 'ATR-based trailing lets winners run while profits ratchet up — exits on price cross, not fixed USD floors.',
  },
  {
    title: 'Confidence scoring',
    text: 'Each setup is scored before entry. Trades execute only when thresholds and your bot settings align.',
  },
  {
    title: 'Risk gates',
    text: 'Position sizing, leverage caps, and exposure limits respond to your HL balance and open-trade state.',
  },
  {
    title: 'Live terminal',
    text: 'Charts, open positions, trade history, and bot controls in one workspace alongside manual trading.',
  },
  {
    title: 'Gas covered',
    text: 'Network gas on Arbitrum for automated bot trades is paid by HyperGain — not billed per trade.',
  },
] as const;
