import { supabase } from './supabase';

export const REFERRAL_CODE_STORAGE_KEY = 'referral_code';

/** Accept ?ref=CODE or ?referral=CODE (case-insensitive). */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code || code.length < 4 || code.length > 32) return null;
  return code;
}

export function captureReferralFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const ref = normalizeReferralCode(params.get('ref') ?? params.get('referral'));
  if (!ref) return null;
  try {
    localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, ref);
  } catch {
    /* ignore quota / private mode */
  }
  return ref;
}

export function getStoredReferralCode(): string | null {
  try {
    return normalizeReferralCode(localStorage.getItem(REFERRAL_CODE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  try {
    localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Share link — works on any page; ?ref= is captured globally before signup. */
export function buildReferralShareUrl(code: string): string {
  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://monadier.com';
  return `${origin}/?ref=${encodeURIComponent(normalizeReferralCode(code) ?? code)}`;
}

const PERMANENT_REFERRAL_ERRORS = new Set([
  'Invalid referral code',
  'Already used a referral code',
  'Cannot use own referral code',
]);

export async function applyStoredReferralForUser(
  userId: string
): Promise<{ success: boolean; message?: string }> {
  const code = getStoredReferralCode();
  if (!code) return { success: false };

  try {
    const { data, error } = await supabase.rpc('apply_referral_code', {
      p_referred_user_id: userId,
      p_referral_code: code,
    });

    if (error) {
      console.warn('[referral] apply_referral_code error:', error.message);
      return { success: false, message: error.message };
    }

    const payload = data as { success?: boolean; error?: string; message?: string } | null;
    if (payload?.success) {
      clearStoredReferralCode();
      return { success: true, message: payload.message };
    }

    const errMsg = payload?.error ?? 'Referral not applied';
    if (PERMANENT_REFERRAL_ERRORS.has(errMsg)) {
      clearStoredReferralCode();
    }
    return { success: false, message: errMsg };
  } catch (err) {
    console.warn('[referral] apply failed:', err);
    return { success: false };
  }
}
