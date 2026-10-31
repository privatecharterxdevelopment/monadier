import { supabase } from './supabase';

/** Session flag set when /auth/callback or email link finishes password recovery (PKCE clears URL). */
export const PASSWORD_RECOVERY_FLAG = 'monadier:password-recovery';

export type AuthBootstrapResult = 'recovery' | 'sign_in' | 'none' | 'error';

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
  return isRecoveryUrl();
}

export function isRecoveryUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('recovery') === '1' || params.get('type') === 'recovery') return true;
  return window.location.hash.includes('type=recovery');
}

export function hasAuthParamsInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('code') || params.get('token_hash')) return true;
  const hash = window.location.hash;
  return hash.includes('access_token') || hash.includes('type=recovery');
}

function cleanupAuthUrl(): void {
  const path = window.location.pathname;
  if (path === '/reset-password') {
    window.history.replaceState(null, '', '/reset-password?recovery=1');
    return;
  }
  if (path === '/auth/callback' || path === '/') {
    window.history.replaceState(null, '', path === '/' ? '/' : '/auth/callback');
  }
}

/**
 * Exchange PKCE code / OTP / hash tokens from email links into a Supabase session.
 * Returns whether this is a password-recovery session or a normal sign-in.
 */
export async function bootstrapSupabaseAuthFromUrl(): Promise<AuthBootstrapResult> {
  const params = new URLSearchParams(window.location.search);
  const urlRecovery = isRecoveryUrl();
  const tokenHash = params.get('token_hash');
  const otpType = params.get('type');

  if (tokenHash && otpType === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (error) return 'error';
    markPasswordRecoveryPending();
    cleanupAuthUrl();
    return 'recovery';
  }

  if (!hasAuthParamsInUrl()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session && isPasswordRecoveryPending()) return 'recovery';
    return 'none';
  }

  let resolvedEvent: string | null = null;
  const eventWaiter = new Promise<void>((resolve) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (
        event === 'PASSWORD_RECOVERY' ||
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION'
      ) {
        resolvedEvent = event;
        subscription.unsubscribe();
        resolve();
      }
    });
    window.setTimeout(() => {
      subscription.unsubscribe();
      resolve();
    }, 4000);
  });

  try {
    if (params.get('code')) {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) return 'error';
    } else if (window.location.hash.includes('access_token')) {
      await new Promise((r) => setTimeout(r, 800));
    }

    await eventWaiter;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return 'error';

    const isRecovery =
      resolvedEvent === 'PASSWORD_RECOVERY' || urlRecovery || isPasswordRecoveryPending();

    if (isRecovery) {
      markPasswordRecoveryPending();
      cleanupAuthUrl();
      return 'recovery';
    }

    cleanupAuthUrl();
    return 'sign_in';
  } catch {
    return 'error';
  }
}
