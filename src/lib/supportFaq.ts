export type LandingFaqItem = {
  tab: string;
  q: string;
  a: string;
};

/** Indices into landing.faq.items — stable across all locale files. */
const SUPPORT_LANDING_FAQ_INDICES = [
  0, 1, 2, 4, 5, // platform: what is, safe, non-custodial, not advice, why HL
  6, 9, 12, 13, // bot: how it works, manual close, no PC, deposit
  14, 15, 16, 17, 18, // vault: min USDC, fees, withdraw, why HL, wallet signatures
] as const;

/** Landing FAQ subset for the support page (platform, setup, safety, fees). */
export function pickSupportFaqs(items: LandingFaqItem[]): LandingFaqItem[] {
  return SUPPORT_LANDING_FAQ_INDICES.map((i) => items[i]).filter(Boolean);
}
