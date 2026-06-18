const STORAGE_PREFIX = 'monadier_hl_bot_onboarding_complete_v1';

export function hlBotOnboardingStorageKey(
  userId?: string | null,
  wallet?: string | null
): string {
  if (userId) return `${STORAGE_PREFIX}:user:${userId}`;
  if (wallet) return `${STORAGE_PREFIX}:wallet:${wallet.toLowerCase()}`;
  return `${STORAGE_PREFIX}:anon`;
}

export function readHlBotOnboardingComplete(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeHlBotOnboardingComplete(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore quota / private mode */
  }
}
