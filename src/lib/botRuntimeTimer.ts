/** Max display range: 5 years (leap years approximated). */
export const MAX_BOT_RUNTIME_SECONDS = Math.floor(5 * 365.25 * 24 * 60 * 60);

const STORAGE_PREFIX = 'hl_bot_start_time_';

function storageKey(wallet: string): string {
  return `${STORAGE_PREFIX}${wallet.toLowerCase()}`;
}

export function markBotRuntimeStarted(wallet: string, atMs = Date.now()): void {
  try {
    localStorage.setItem(storageKey(wallet), String(atMs));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearBotRuntimeTimer(wallet: string): void {
  try {
    localStorage.removeItem(storageKey(wallet));
  } catch {
    /* ignore */
  }
}

export function readBotRuntimeStartMs(wallet: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

/** Format elapsed seconds as days, hours, minutes, seconds (up to multi-year ranges). */
export function formatBotRuntime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  const mins = Math.floor((s % 3_600) / 60);
  const secs = s % 60;

  if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
