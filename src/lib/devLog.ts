/** Background sync / optional paths — never spam production consoles. */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args);
}

export function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) console.warn(...args);
}

export function devError(...args: unknown[]): void {
  if (import.meta.env.DEV) console.error(...args);
}

export function isHlRateLimitError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && (err as { status?: number }).status === 429) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || /too many requests/i.test(msg);
}
