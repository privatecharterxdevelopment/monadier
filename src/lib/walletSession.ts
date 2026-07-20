/** Keep wallet session alive while browsing — 24 hours (extend on activity). */
export const WALLET_SESSION_MS = 24 * 60 * 60 * 1000;

/** While reconnect runs after reload, UI stays in "restoring" instead of prompting connect. */
export const WALLET_RECONNECT_GRACE_MS = 90_000;

const STORAGE_KEY = 'monadier-wallet-session-v1';
const COOKIE_KEY = 'monadier_wallet_session_v1';

export type WalletSessionRecord = {
  address: string;
  connectedAt: number;
  expiresAt: number;
  connectorId?: string;
};

function cookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const h = window.location.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return undefined;
  if (h.endsWith('.vercel.app')) return undefined;
  const parts = h.split('.').filter(Boolean);
  if (parts.length < 2) return undefined;
  return `.${parts.slice(-2).join('.')}`;
}

function writeSessionCookie(raw: string, maxAgeSec: number): void {
  if (typeof document === 'undefined') return;
  const domain = cookieDomain();
  if (!domain) return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(raw)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax; Domain=${domain}${secure}`;
}

function readSessionCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${COOKIE_KEY}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

function clearSessionCookie(): void {
  writeSessionCookie('', 0);
}

function parseRecord(raw: string | null): WalletSessionRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WalletSessionRecord;
    if (!parsed?.address || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readWalletSession(): WalletSessionRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const fromLs = parseRecord(localStorage.getItem(STORAGE_KEY));
    if (fromLs) return fromLs;
    const fromCookie = parseRecord(readSessionCookie());
    if (fromCookie) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fromCookie));
      } catch {
        /* ignore */
      }
      return fromCookie;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeWalletSession(
  address: string,
  connectorId?: string
): WalletSessionRecord {
  const now = Date.now();
  const existing = readWalletSession();
  const record: WalletSessionRecord = {
    address: address.toLowerCase(),
    connectedAt: existing?.address === address.toLowerCase() ? existing.connectedAt : now,
    expiresAt: now + WALLET_SESSION_MS,
    connectorId: connectorId ?? existing?.connectorId,
  };
  const raw = JSON.stringify(record);
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* private mode / quota */
  }
  writeSessionCookie(raw, Math.floor(WALLET_SESSION_MS / 1000));
  return record;
}

export function extendWalletSessionOnActivity(): WalletSessionRecord | null {
  const existing = readWalletSession();
  if (!existing) return null;
  const record: WalletSessionRecord = {
    ...existing,
    expiresAt: Date.now() + WALLET_SESSION_MS,
  };
  const raw = JSON.stringify(record);
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* private mode / quota */
  }
  writeSessionCookie(raw, Math.floor(WALLET_SESSION_MS / 1000));
  return record;
}

export function touchWalletSession(
  address: string,
  connectorId?: string
): WalletSessionRecord | null {
  return writeWalletSession(address, connectorId);
}

export function clearWalletSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  clearSessionCookie();
}

export function isWalletSessionActive(): boolean {
  return readWalletSession() != null;
}
