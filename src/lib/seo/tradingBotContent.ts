/** SEO-focused content for /trading-bot — English only (marketing). */

export type TradingBotFaq = { q: string; a: string };

export const TRADING_BOT_FAQS: TradingBotFaq[] = [
  {
    q: 'What is the Monadier Hyperliquid trading bot?',
    a: 'Monadier is a full auto trading bot for Hyperliquid perpetuals. You deposit USDC on your own Hyperliquid account, approve the Monadier agent once, and the bot scans 200+ HL markets 24/7 to open and close trades automatically.',
  },
  {
    q: 'Is this a passive income trading bot?',
    a: 'The bot runs 24/7 on Monadier servers while you are offline — but crypto trading is not guaranteed income. It automates execution; profits and losses depend on market conditions. Only use capital you can afford to lose.',
  },
  {
    q: 'Is the Hyperliquid bot non-custodial?',
    a: 'Yes. Your USDC stays on your Hyperliquid account in your name. Monadier never holds your private keys. The approved agent can place trades but cannot withdraw funds without your wallet.',
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
    a: 'No platform subscription. Monadier covers Arbitrum gas for bot trades. A 10% success fee applies only on profitable closes. Standard Hyperliquid trading and funding fees also apply.',
  },
  {
    q: 'Can I stop the bot or close trades manually?',
    a: 'Yes. Press Stop bot to halt new entries. Open positions remain on Hyperliquid until take profit, stop loss, or manual close in the terminal or on app.hyperliquid.xyz.',
  },
  {
    q: 'Do I need trading experience to use the bot?',
    a: 'No PhD required — connect wallet, fund HL, approve agent, set risk parameters, and start. Leverage is optional and suited to experienced traders. Crypto perpetuals carry substantial risk.',
  },
  {
    q: 'How is Monadier different from manual Hyperliquid trading?',
    a: 'Monadier adds full auto execution, multi-timeframe signal scanning, dynamic trailing stops, and 24/7 monitoring in one terminal — while your funds stay non-custodial on Hyperliquid.',
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
    text: 'No monthly platform fee to run the bot. You pay a success fee only when trades close in profit.',
  },
  {
    title: 'You stay in control',
    text: 'Start, stop, adjust TP/SL and leverage, close positions manually, or withdraw HL funds anytime.',
  },
] as const;

export const TRADING_BOT_FEATURES = [
  {
    title: 'Multi-timeframe signals',
    text: 'Combines 1m through 1h structure to align short-term entries with broader Hyperliquid trend context.',
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
    text: 'Network gas on Arbitrum for automated bot trades is paid by Monadier — not billed per trade.',
  },
] as const;
