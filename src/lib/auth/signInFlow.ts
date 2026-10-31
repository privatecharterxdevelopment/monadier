import { signIn, signInWithGoogle } from '../supabase';
import { checkAuthIpBlocked, recordAuthIpFailure } from '../authLockout';
import { humanizeSignInError } from './authErrors';

export type SignInFlowMessages = {
  signInFailed: string;
  googleFailed: string;
};

const LOCKED_MSG = 'Too many attempts. Try again later.';

export async function submitSignIn(
  email: string,
  password: string,
  messages: SignInFlowMessages
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const lock = await checkAuthIpBlocked();
    if (lock.blocked) {
      return { ok: false, error: LOCKED_MSG };
    }

    const { error } = await signIn(email, password);
    if (error) {
      const after = await recordAuthIpFailure(email);
      if (after.blocked) {
        return { ok: false, error: LOCKED_MSG };
      }
      throw error;
    }
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: humanizeSignInError(err, messages.signInFailed),
    };
  }
}

export async function startGoogleSignIn(
  messages: Pick<SignInFlowMessages, 'googleFailed'>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const lock = await checkAuthIpBlocked();
    if (lock.blocked) {
      return { ok: false, error: LOCKED_MSG };
    }
    const { error } = await signInWithGoogle();
    if (error) throw error;
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : messages.googleFailed,
    };
  }
}
