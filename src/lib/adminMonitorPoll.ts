/** Admin monitor auto-refresh — tab visible vs background. */
export const ADMIN_HL_FAST_POLL_MS = 5_000;
export const ADMIN_FULL_SNAPSHOT_POLL_MS = 20_000;
export const ADMIN_BACKGROUND_POLL_MS = 60_000;

export function adminPollIntervalMs(kind: 'fast' | 'full'): number {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return ADMIN_BACKGROUND_POLL_MS;
  }
  return kind === 'fast' ? ADMIN_HL_FAST_POLL_MS : ADMIN_FULL_SNAPSHOT_POLL_MS;
}