const STORAGE_PREFIX = 'hypergain_welcome_walkthrough_v1';
const PENDING_KEY = 'hypergain_welcome_walkthrough_pending_v1';

export function welcomeWalkthroughKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId.toLowerCase()}`;
}

export function readWelcomeWalkthroughDone(userId: string | null | undefined): boolean {
  if (!userId || typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(welcomeWalkthroughKey(userId)) === '1';
  } catch {
    return true;
  }
}

export function writeWelcomeWalkthroughDone(userId: string): void {
  if (!userId) return;
  try {
    localStorage.setItem(welcomeWalkthroughKey(userId), '1');
  } catch {
    /* ignore quota / private mode */
  }
  clearWelcomeWalkthroughPending();
}

/** Call right after a successful new registration (email session or Google from register). */
export function markWelcomeWalkthroughPending(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function readWelcomeWalkthroughPending(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearWelcomeWalkthroughPending(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
