/** Session flag set when /auth/callback finishes a password-recovery redirect (PKCE clears URL hash). */
export const PASSWORD_RECOVERY_FLAG = 'monadier:password-recovery';

export function markPasswordRecoveryPending(): void {
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_FLAG, '1');
  } catch {
    /* private mode */
  }
}

export function clearPasswordRecoveryPending(): void {
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_FLAG);
  } catch {
    /* private mode */
  }
}

export function isPasswordRecoveryPending(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(PASSWORD_RECOVERY_FLAG) === '1') return true;
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('recovery') === '1' || params.get('type') === 'recovery') return true;
  return window.location.hash.includes('type=recovery');
}
