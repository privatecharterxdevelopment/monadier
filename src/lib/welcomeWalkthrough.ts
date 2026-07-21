const STORAGE_PREFIX = 'hypergain_welcome_walkthrough_v1';

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
}
