export type LandingFaqItem = {
  tab: string;
  q: string;
  a: string;
};

/** Indices into landing.faq.items — stable across all locale files. */
const SUPPORT_LANDING_FAQ_INDICES = [
  0, 1, 2, 3, 5, 6, // platform: what is, not supplement, safe, non-custodial, not advice, why HL
  7, 10, 13, 14, // bot: how it works, manual close, no PC, deposit
  15, 16, 17, 18, 19, // vault: min USDC, fees, withdraw, why HL, wallet signatures
] as const;

/** Landing FAQ subset for the support page (platform, setup, safety, fees). */
export function pickSupportFaqs(items: LandingFaqItem[]): LandingFaqItem[] {
  return SUPPORT_LANDING_FAQ_INDICES.map((i) => items[i]).filter(Boolean);
}
