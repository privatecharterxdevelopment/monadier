/**
 * Cross-subdomain auth storage for split hosts (www / apex / app.hypergain.io).
 * localStorage alone is origin-scoped — login on www then hard-nav to app looked logged out.
 * Cookies on `.hypergain.io` keep the Supabase session shared for at least 24h (default 7d).
 */

const MAX_AGE_SEC = 60 * 60 * 24 * 7;
const CHUNK_SIZE = 3000;

type AuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function cookieDomain(): string | undefined {
  if (!isBrowser()) return undefined;
  const h = window.location.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return undefined;
  if (h.endsWith('.vercel.app')) return undefined;
  const parts = h.split('.').filter(Boolean);
  if (parts.length < 2) return undefined;
  return `.${parts.slice(-2).join('.')}`;
}

function useSharedCookies(): boolean {
  return Boolean(cookieDomain());
}

function writeCookie(name: string, value: string, maxAgeSec: number): void {
  const domain = cookieDomain();
  const domainAttr = domain ? `; Domain=${domain}` : '';
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${domainAttr}${secure}`;
}

function readCookie(name: string): string | null {
  const target = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

function deleteCookie(name: string): void {
  writeCookie(name, '', 0);
}

function chunkKey(base: string, index: number): string {
  return `${base}.${index}`;
}

function writeChunked(key: string, value: string): void {
  const chunks = Math.ceil(value.length / CHUNK_SIZE) || 1;
  writeCookie(`${key}.chunks`, String(chunks), MAX_AGE_SEC);
  for (let i = 0; i < chunks; i += 1) {
    writeCookie(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), MAX_AGE_SEC);
  }
  for (let i = chunks; i < chunks + 8; i += 1) {
    if (!readCookie(chunkKey(key, i))) break;
    deleteCookie(chunkKey(key, i));
  }
}

function readChunked(key: string): string | null {
  const countRaw = readCookie(`${key}.chunks`);
  if (!countRaw) {
    return readCookie(key);
  }
  const count = Number(countRaw);
  if (!Number.isFinite(count) || count <= 0) return null;
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const part = readCookie(chunkKey(key, i));
    if (part == null) return null;
    out += part;
  }
  return out;
}

function clearChunked(key: string): void {
  const countRaw = readCookie(`${key}.chunks`);
  const count = Number(countRaw);
  if (Number.isFinite(count) && count > 0) {
    for (let i = 0; i < count; i += 1) deleteCookie(chunkKey(key, i));
  } else {
    for (let i = 0; i < 12; i += 1) {
      if (!readCookie(chunkKey(key, i))) break;
      deleteCookie(chunkKey(key, i));
    }
  }
  deleteCookie(`${key}.chunks`);
  deleteCookie(key);
}

/** Dual-write: cookies (cross-subdomain) + localStorage (same-origin / localhost). */
export const authCookieStorage: AuthStorage = {
  getItem(key: string): string | null {
    if (!isBrowser()) return null;
    try {
      if (useSharedCookies()) {
        const fromCookie = readChunked(key);
        if (fromCookie != null) {
          try {
            localStorage.setItem(key, fromCookie);
          } catch {
            /* ignore */
          }
          return fromCookie;
        }
      }
      const fromLs = localStorage.getItem(key);
      if (fromLs && useSharedCookies()) {
        writeChunked(key, fromLs);
      }
      return fromLs;
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (!isBrowser()) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
    if (useSharedCookies()) {
      try {
        writeChunked(key, value);
      } catch {
        /* cookie blocked / quota */
      }
    }
  },

  removeItem(key: string): void {
    if (!isBrowser()) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    if (useSharedCookies()) {
      try {
        clearChunked(key);
      } catch {
        /* ignore */
      }
    }
  },
};
