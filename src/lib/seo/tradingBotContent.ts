/** SEO-focused content for /trading-bot — English only (marketing).
 * Must stay consistent with Terms of Service (no guaranteed returns; Platform Success Fee).
 */

export type TradingBotFaq = { q: string; a: string };

export const TRADING_BOT_FAQS: TradingBotFaq[] = [
  {
    q: 'What is the HyperGain Hyperliquid trading agent?',
    a: 'HyperGain is a full auto AI trading agent for Hyperliquid perpetuals. You deposit USDC on your own Hyperliquid account, approve the HyperGain agent once, and the agent scans 200+ HL markets 24/7 to open and close trades automatically. This is software automation — not a promise of profit.',
  },
  {
    q: 'Does the agent run while I am offline?',
    a: 'The agent can run 24/7 on HyperGain servers while you are offline, but crypto trading is not income and returns are not guaranteed. It automates execution; profits and losses depend on markets, settings, and risk. Only use capital you can afford to lose. See Terms of Service — no promised or guaranteed returns.',
  },
  {
    q: 'Is the Hyperliquid agent non-custodial?',
    a: 'Yes. Your USDC stays on your Hyperliquid account in your name. HyperGain never holds your private keys. The approved agent can place trades but cannot withdraw funds without your wallet.',
  },
  {
    q: 'How much USDC do I need to start the agent?',
    a: 'At least $20 USDC on your Hyperliquid account to run the agent (HL minimum deposit is $5). Deposit native USDC on Arbitrum One only.',
  },
  {
    q: 'Can the trading agent run 24/7?',
    a: 'Yes. Once you press Start agent and your HL account is funded, the agent can scan Hyperliquid perpetuals around the clock. You do not need to keep your browser open. Uptime and fills are not guaranteed (outages, rejections, and slippage can occur).',
  },
  {
    q: 'Which markets does the full auto agent trade?',
    a: 'Any active Hyperliquid perpetual with a valid signal — the agent loads the full HL universe (200+ pairs) and picks the strongest setup each cycle, not a fixed BTC/ETH list.',
  },
  {
    q: 'What fees does the Hyperliquid trading agent charge?',
    a: 'No monthly platform subscription. Standard Hyperliquid trading and funding fees apply on every trade. HyperGain may charge a Platform Success Fee on qualifying profitable closes as disclosed in the Terms of Service and in-app (currently up to 10% when enabled). Arbitrum gas for agent trades may be covered by HyperGain when that feature is active.',
  },
  {
    q: 'Can I stop the agent or close trades manually?',
    a: 'Yes. Press Stop agent to halt new entries. Open positions remain until your configured exits, exchange liquidation, or manual close in the HyperGain terminal. Stop-loss and take-profit fills are not guaranteed (see Terms).',
  },
  {
    q: 'Do I need trading experience to use the agent?',
    a: 'You can connect a wallet, fund HL, approve the agent, set risk parameters, and start — but leveraged crypto perpetuals carry substantial risk of loss. This is not investment advice. Only trade if it is lawful where you live and only with capital you can afford to lose.',
  },
  {
    q: 'How is HyperGain different from manual Hyperliquid trading?',
    a: 'HyperGain adds optional full-auto execution, multi-timeframe scanning, trailing exits when enabled, and 24/7 monitoring in one terminal — while your funds stay non-custodial on Hyperliquid. Automation does not remove market risk.',
  },
];

export const TRADING_BOT_BENEFITS = [
  {
    title: 'Full auto 24/7',
    text: 'The Hyperliquid trading agent can scan listed perps around the clock — no manual chart watching required while it is enabled.',
  },
  {
    title: 'Hands-off automation',
    text: 'Set your risk once, start the agent, and let server-side automation handle entries and exits while you are offline. Results are not guaranteed.',
  },
  {
    title: 'Non-custodial',
    text: 'USDC stays on your Hyperliquid account. Your wallet controls deposits, withdrawals, and the one-time agent approval.',
  },
  {
    title: '200+ HL markets',
    text: 'Not limited to BTC or ETH — the agent ranks the full Hyperliquid perpetual universe each cycle.',
  },
  {
    title: 'Fees as disclosed',
    text: 'No monthly subscription. HL trading/funding fees always apply. A Platform Success Fee may accrue on profitable closes per the Terms and in-app disclosure.',
  },
  {
    title: 'You stay in control',
    text: 'Start, stop, adjust risk and leverage, close positions manually, or withdraw HL funds anytime (wallet signature required for withdrawals).',
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
    title: 'Trails when enabled',
    text: 'ATR-based trailing can manage winners when profit-trail exits are on — fills and protection from liquidation are not guaranteed (Terms §6).',
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
  desc: 'Risk % controls margin per trade — not leverage. Cap LVRG, limit concurrent positions, and preview illustrative P/L before you press Start agent. Illustrative only — not a profit forecast.',
} as const;

export const BOT_AUDIENCE_VIDEO_BANNER = {
  videoSrc: '/videos/6667321-uhd_4096_2160_25fps.mp4',
  lineOne: 'Focus on what matters',
  lineTwo: 'with an agent you control',
} as const;

export const BOT_PAGE_HERO = {
  title: 'Trading agent',
  rotateLines: ['200+ markets', 'runs 24/7', 'trails profits'],
  footer: 'on Hyperliquid',
  tagline: 'Hands-off Hyperliquid automation — on-chain positions, no guaranteed returns.',
  lead: 'Approve once, fund HL USDC, and let the agent scan perpetuals while you are offline. You bear every trade’s risk.',
} as const;

export const BOT_PAGE_LEADERBOARD = {
  eyebrow: 'On-chain proof',
  title: 'Leaderboard',
  lead: 'Live Hyperliquid L1 fills from agent wallets — wallet labels only, full addresses on HypurrScan. Past results do not predict future performance.',
} as const;

export const TRADING_BOT_FEATURES = [
  {
    title: 'Multi-timeframe signals',
    text: 'Combines 5m through 1h structure to align entries with broader Hyperliquid trend context.',
  },
  {
    title: 'Dynamic trailing stops',
    text: 'When enabled, ATR-based trailing can ratchet wins — exit fills are not guaranteed under volatility or outages.',
  },
  {
    title: 'Confidence scoring',
    text: 'Each setup is scored before entry. Trades execute only when thresholds and your agent settings align.',
  },
  {
    title: 'Risk gates',
    text: 'Position sizing, leverage caps, and exposure limits respond to your HL balance and open-trade state.',
  },
  {
    title: 'Live terminal',
    text: 'Charts, open positions, trade history, and agent controls in one workspace alongside manual trading.',
  },
  {
    title: 'Gas covered',
    text: 'Network gas on Arbitrum for automated agent trades may be paid by HyperGain when that feature is active — not a fee waiver on HL trading costs.',
  },
] as const;
