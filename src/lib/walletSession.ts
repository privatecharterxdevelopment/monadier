/** Keep wallet session alive while browsing — 5 hours (extend on activity). */
export const WALLET_SESSION_MS = 5 * 60 * 60 * 1000;

/** While reconnect runs after reload, UI stays in "restoring" instead of prompting connect. */
export const WALLET_RECONNECT_GRACE_MS = 90_000;

const STORAGE_KEY = 'monadier-wallet-session-v1';

export type WalletSessionRecord = {
  address: string;
  connectedAt: number;
  expiresAt: number;
  connectorId?: string;
};

export function readWalletSession(): WalletSessionRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletSessionRecord;
    if (!parsed?.address || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* private mode / quota */
  }
  return record;
}

export function extendWalletSessionOnActivity(): WalletSessionRecord | null {
  const existing = readWalletSession();
  if (!existing) return null;
  const record: WalletSessionRecord = {
    ...existing,
    expiresAt: Date.now() + WALLET_SESSION_MS,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* private mode / quota */
  }
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
}

export function isWalletSessionActive(): boolean {
  return readWalletSession() != null;
}
