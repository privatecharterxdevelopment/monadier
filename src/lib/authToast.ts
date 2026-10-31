/** Set before navigating to dashboard after login; consumed once on dashboard2 mount */
export const AUTH_TOAST_STORAGE_KEY = 'monadier_auth_toast';

export type AuthToastKind = 'signed_in' | 'signed_out';

export function queueAuthToast(kind: AuthToastKind) {
  try {
    sessionStorage.setItem(AUTH_TOAST_STORAGE_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function consumeAuthToast(): AuthToastKind | null {
  try {
    const v = sessionStorage.getItem(AUTH_TOAST_STORAGE_KEY) as AuthToastKind | null;
    if (v) sessionStorage.removeItem(AUTH_TOAST_STORAGE_KEY);
    return v;
  } catch {
    return null;
  }
}
