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

/** Wallets with unlimited bot access — no platform fees (Lorenzo only). */
export const FEE_EXEMPT_WALLETS = [
  '0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c',
  '0x492402bd607a72cbf0a90280aae9b7905372829c',
] as const;

/** Emails that never pay platform fees — Lorenzo only. Everyone else pays. */
export const FEE_EXEMPT_EMAILS = [
  'lorenzo.vanza@hotmail.com',
  'ipsunlorem@gmail.com',
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

/** Lorenzo only — both admin emails. Nobody else is fee-exempt. */
export function isFeeExemptUser(
  email: string | undefined | null,
  wallet?: string | undefined | null
): boolean {
  return isFeeExemptEmail(email) || isFeeExemptWallet(wallet);
}
