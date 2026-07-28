/**
 * Admin access — keep in sync with supabase is_admin() migration.
 * Override via VITE_ADMIN_EMAILS=comma,separated,emails in Vercel / .env.local
 */
export const ADMIN_EMAILS = [
  'ipsunlorem@gmail.com',
  'lorenzo.vanza@hotmail.com',
] as const;

const DEFAULT_ADMIN_EMAILS: string[] = [...ADMIN_EMAILS];

export function getAdminEmails(): string[] {
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;
  if (!raw?.trim()) {
    return DEFAULT_ADMIN_EMAILS;
  }
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/** Wallets with unlimited bot access — no platform fees or fee gates (keep in sync with platform_fee_waivers). */
export const FEE_EXEMPT_WALLETS = [
  '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
] as const;

/** Emails that never pay platform / trading / betting fees. */
export const FEE_EXEMPT_EMAILS = [
  'claudio.steyskal@icloud.com',
] as const;

export function isFeeExemptWallet(wallet: string | undefined | null): boolean {
  if (!wallet) return false;
  const w = wallet.trim().toLowerCase();
  return FEE_EXEMPT_WALLETS.some((a) => a === w);
}

export function isFeeExemptEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return FEE_EXEMPT_EMAILS.some((a) => a === e);
}

/** Admin email, exempt email, or exempt wallet — skip all platform fee UI, gates, and bot blockers. */
export function isFeeExemptUser(
  email: string | undefined | null,
  wallet?: string | undefined | null
): boolean {
  return isAdminEmail(email) || isFeeExemptEmail(email) || isFeeExemptWallet(wallet);
}
