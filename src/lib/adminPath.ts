/**
 * Obscure admin path — not linked in UI. Override with VITE_ADMIN_PATH=/yoursecret
 * Keep in sync with robots.txt Disallow.
 */
export const DEFAULT_ADMIN_PATH = '/28858885';

export function getAdminPath(): string {
  const raw = (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim();
  if (raw && /^\/[A-Za-z0-9_-]{4,64}$/.test(raw)) {
    return raw.replace(/\/+$/, '') || DEFAULT_ADMIN_PATH;
  }
  return DEFAULT_ADMIN_PATH;
}

export function isAdminPath(pathname: string): boolean {
  const admin = getAdminPath();
  return pathname === admin || pathname.startsWith(`${admin}/`);
}
