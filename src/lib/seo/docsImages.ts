/** Crawlable Docs screenshots — filenames, alts, sitemap + ImageObject for Google Images. */

export type DocsSeoImage = {
  id: 'deposit-bridging' | 'deposit-successful';
  src: string;
  width: number;
  height: number;
  /** Google Images title */
  seoTitle: string;
  /** Google Images caption + ImageObject description */
  seoCaption: string;
  /** Visible alt on the docs article */
  alt: string;
  /** Docs article slug that embeds this image */
  articleSlug: string;
};

export const DOCS_SEO_IMAGES: readonly DocsSeoImage[] = [
  {
    id: 'deposit-bridging',
    src: '/images/docs/hypergain-hyperliquid-usdc-deposit-bridging.png',
    width: 1024,
    height: 504,
    seoTitle: 'HyperGain depositing USDC to Hyperliquid — Arbitrum bridge in progress',
    seoCaption:
      'HyperGain Funds deposit: bridging native Arbitrum USDC to Hyperliquid. Wallet signed and Arbitrum confirmed — waiting for Hyperliquid credit (~1–3 min).',
    alt: 'HyperGain Deposit modal showing Depositing to Hyperliquid — $190 USDC sent on Arbitrum, wallet signed and Arbitrum confirmed, Hyperliquid credit pending',
    articleSlug: 'depositing-bridging-hyperliquid',
  },
  {
    id: 'deposit-successful',
    src: '/images/docs/hypergain-hyperliquid-deposit-successful-no-extra-fees.png',
    width: 1024,
    height: 505,
    seoTitle: 'HyperGain Hyperliquid deposit successful — no HyperGain deposit fee',
    seoCaption:
      'HyperGain deposit successful on Hyperliquid. HyperGain does not add deposit or bridge fees — only Hyperliquid / network fees apply. Funds credit to your HL balance.',
    alt: 'HyperGain Deposit successful screen — USDC credited on Hyperliquid with Done button; no HyperGain extra deposit charge',
    articleSlug: 'deposit-successful-no-extra-fees',
  },
] as const;

export function getDocsSeoImage(slug: string): DocsSeoImage | undefined {
  return DOCS_SEO_IMAGES.find((img) => img.articleSlug === slug);
}
