import {
  signUp,
  signIn,
  signInWithGoogle,
  sendWelcomeEmail,
  isUsernameAvailable,
} from '../supabase';
import { validateUsername } from '../username';
import { ensureFreeSubscription } from '../ensureSubscription';
import { acceptUserLegalTerms } from '../legalAcceptance';
import {
  applyStoredReferralForUser,
  getStoredReferralCode,
} from '../referralCapture';
import {
  humanizeSignUpError,
  isDuplicateSignUpUser,
  isEmailConfirmationRequired,
  authErrorCode,
} from './authErrors';

export type RegisterFormValues = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  country: string;
  acceptedTerms: boolean;
};

export type RegisterFlowResult =
  | { ok: true; kind: 'session'; userId: string }
  | { ok: true; kind: 'confirm_email'; userId?: string }
  | { ok: false; error: string };

export type RegisterFlowMessages = {
  acceptTermsRequired: string;
  usernameTaken: string;
  createFailed: string;
  googleFailed: string;
};

export async function startGoogleAuth(messages: Pick<RegisterFlowMessages, 'googleFailed'>): Promise<{
  ok: boolean;
  error?: string;
}> {
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

export async function submitRegister(
  values: RegisterFormValues,
  messages: RegisterFlowMessages
): Promise<RegisterFlowResult> {
  if (!values.acceptedTerms) {
    return { ok: false, error: messages.acceptTermsRequired };
  }

  const usernameErr = validateUsername(values.username);
  if (usernameErr) {
    return { ok: false, error: usernameErr };
  }

  const available = await isUsernameAvailable(values.username);
  if (!available) {
    return { ok: false, error: messages.usernameTaken };
  }

  try {
    const { data, error } = await signUp(
      values.email,
      values.password,
      values.fullName,
      values.country,
      values.username
    );
    if (error) throw error;

    if (isDuplicateSignUpUser(data?.user)) {
      return {
        ok: false,
        error: humanizeSignUpError(
          { message: 'User already registered' },
          messages.createFailed
        ),
      };
    }

    let session = data?.session ?? null;
    const userId = data?.user?.id;

    // No session yet — sign in once (confirmations off) or detect real confirm gate.
    if (!session) {
      const signedIn = await signIn(values.email, values.password);
      if (signedIn.data?.session) {
        session = signedIn.data.session;
      } else if (signedIn.error) {
        const needsConfirm =
          isEmailConfirmationRequired(signedIn.error) ||
          authErrorCode(signedIn.error) === 'email_not_confirmed';
        if (needsConfirm) {
          sendWelcomeEmail(values.email, values.fullName).catch(console.error);
          return { ok: true, kind: 'confirm_email', userId };
        }
        throw signedIn.error;
      }
    }

    if (session) {
      void ensureFreeSubscription().catch(console.error);
      void acceptUserLegalTerms().catch(console.error);
    }

    sendWelcomeEmail(values.email, values.fullName).catch(console.error);

    if (userId && getStoredReferralCode()) {
      try {
        await applyStoredReferralForUser(userId);
      } catch (refError) {
        console.error('Referral code error:', refError);
      }
    }

    if (session) {
      return { ok: true, kind: 'session', userId: userId ?? '' };
    }

    return {
      ok: false,
      error: messages.createFailed,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: humanizeSignUpError(err, messages.createFailed),
    };
  }
}
