/** Crawlable How-it-works screenshots — filenames, alts, and sitemap copy for Google Images. */

export type HowItWorksLayout = 'portrait' | 'landscape';

export type HowItWorksImage = {
  id: 'funds' | 'settings' | 'slots' | 'deposit';
  src: string;
  /** Responsive WebP candidates (`url width`). */
  webpSrcSet: string;
  sizes: string;
  width: number;
  height: number;
  layout: HowItWorksLayout;
  /** Google Images title */
  seoTitle: string;
  /** Google Images caption + ImageObject description */
  seoCaption: string;
};

export const HOW_IT_WORKS_IMAGES: readonly HowItWorksImage[] = [
  {
    id: 'funds',
    src: '/images/how-it-works/hypergain-bot-funds-deposit-withdraw.png',
    webpSrcSet:
      '/images/how-it-works/hypergain-bot-funds-deposit-withdraw-280.webp 280w, /images/how-it-works/hypergain-bot-funds-deposit-withdraw-567.webp 567w',
    sizes: '(max-width: 640px) 200px, 220px',
    width: 567,
    height: 1024,
    layout: 'portrait',
    seoTitle: 'HyperGain agent Funds — deposit and withdraw USDC on Hyperliquid',
    seoCaption:
      'HyperGain Funds tab: Hyperliquid trading balance, withdrawable USDC, and Deposit / Withdraw. No API keys — funds stay on Hyperliquid.',
  },
  {
    id: 'settings',
    src: '/images/how-it-works/hypergain-bot-running-settings.png',
    webpSrcSet:
      '/images/how-it-works/hypergain-bot-running-settings-280.webp 280w, /images/how-it-works/hypergain-bot-running-settings-567.webp 567w',
    sizes: '(max-width: 640px) 200px, 220px',
    width: 567,
    height: 1024,
    layout: 'portrait',
    seoTitle: 'HyperGain agent settings — risk, leverage, and profit trail stop loss',
    seoCaption:
      'HyperGain agent running with simple settings: risk, leverage, and intelligent profit-trail stop loss. As simple as the app itself.',
  },
  {
    id: 'slots',
    src: '/images/how-it-works/hypergain-bot-open-trade-slots.png',
    webpSrcSet:
      '/images/how-it-works/hypergain-bot-open-trade-slots-280.webp 280w, /images/how-it-works/hypergain-bot-open-trade-slots-560.webp 560w',
    sizes: '(max-width: 640px) 200px, 220px',
    width: 560,
    height: 1024,
    layout: 'portrait',
    seoTitle: 'HyperGain agent open trade slots — choose 2 or 3 Hyperliquid positions',
    seoCaption:
      'HyperGain Settings: pick 2 or 3 open trade slots. Risk splits across slots on your Hyperliquid balance.',
  },
  {
    id: 'deposit',
    src: '/images/how-it-works/hyperliquid-usdc-deposit.png',
    webpSrcSet:
      '/images/how-it-works/hyperliquid-usdc-deposit-280.webp 280w, /images/how-it-works/hyperliquid-usdc-deposit-560.webp 560w',
    sizes: '(max-width: 640px) 200px, 220px',
    width: 674,
    height: 856,
    layout: 'portrait',
    seoTitle: 'Hyperliquid USDC deposit from Arbitrum — no exchange API',
    seoCaption:
      'Deposit native USDC on Arbitrum into Hyperliquid. No API connections, no exchange logins, no custody — withdraw anytime.',
  },
] as const;

export const HOW_IT_WORKS_STEP_SCHEMA: Record<
  HowItWorksImage['id'],
  { name: string; text: string }
> = {
  funds: {
    name: 'Deposit and withdraw on Hyperliquid',
    text: 'Open Funds. Deposit USDC to your Hyperliquid account and withdraw anytime. No API keys, no exchange connections.',
  },
  settings: {
    name: 'Set simple agent settings',
    text: 'Risk, leverage, and profit trail — a few controls, as simple as the app itself. Then start the agent.',
  },
  slots: {
    name: 'Choose 2 or 3 open trade slots',
    text: 'You decide how many trades can be open at once. Risk splits across 2 or 3 slots.',
  },
  deposit: {
    name: 'Fund with native USDC — nothing fishy',
    text: 'Move USDC from Arbitrum onto Hyperliquid. You sign every deposit and withdrawal. Funds never leave Hyperliquid for a third-party exchange.',
  },
};
