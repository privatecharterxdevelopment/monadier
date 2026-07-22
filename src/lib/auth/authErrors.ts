import type { AuthError } from '@supabase/supabase-js';

function msg(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

/** Map Supabase auth errors to user-facing copy. */
export function humanizeSignInError(error: unknown, fallback: string): string {
  const raw = msg(error);
  const lower = raw.toLowerCase();

  if (lower.includes('email not confirmed') || lower.includes('confirm your email')) {
    return 'Please confirm your email first (check inbox/spam), then sign in again.';
  }
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password')
  ) {
    return 'Wrong email or password. Try again or reset your password.';
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (lower.includes('user banned') || lower.includes('disabled')) {
    return 'This account is disabled. Contact administration@hypergain.io.';
  }

  return raw || fallback;
}

export function humanizeSignUpError(error: unknown, fallback: string): string {
  const raw = msg(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already registered')
  ) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (lower.includes('password') && lower.includes('least')) {
    return 'Password must be at least 8 characters.';
  }
  if (lower.includes('valid email') || lower.includes('invalid email')) {
    return 'Enter a valid email address.';
  }
  if (lower.includes('signup is disabled') || lower.includes('signups not allowed')) {
    return 'Registration is temporarily unavailable. Try again later or contact support.';
  }

  return raw || fallback;
}

/** Supabase returns an empty identities array when the email is already taken. */
export function isDuplicateSignUpUser(user: {
  identities?: { provider: string }[] | null;
} | null | undefined): boolean {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}

export function isEmailConfirmationRequired(error: unknown): boolean {
  const lower = msg(error).toLowerCase();
  return lower.includes('email not confirmed') || lower.includes('confirm your email');
}

export function authErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = (error as AuthError).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
