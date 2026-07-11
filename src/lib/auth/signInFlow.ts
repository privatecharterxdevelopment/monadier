import { signIn, signInWithGoogle } from '../supabase';

export type SignInFlowMessages = {
  signInFailed: string;
  googleFailed: string;
};

export async function submitSignIn(
  email: string,
  password: string,
  messages: SignInFlowMessages
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await signIn(email, password);
    if (error) throw error;
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : messages.signInFailed,
    };
  }
}

export async function startGoogleSignIn(
  messages: Pick<SignInFlowMessages, 'googleFailed'>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
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
