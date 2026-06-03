/**
 * Admin access — never hardcode production emails in components.
 * Set VITE_ADMIN_EMAILS=comma,separated,emails in Vercel / .env.local
 */
const DEFAULT_ADMIN_EMAILS = ['ipsunlorem@gmail.com'];

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
