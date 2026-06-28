import { supabase } from './supabase';

export type LegalAcceptanceState = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  accepted: boolean;
};

export async function fetchLegalAcceptance(userId: string): Promise<LegalAcceptanceState> {
  const { data, error } = await supabase
    .from('profiles')
    .select('terms_accepted_at, privacy_accepted_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[fetchLegalAcceptance]', error);
    throw new Error(error.message || 'Could not load legal acceptance');
  }

  const termsAccepted = Boolean(data?.terms_accepted_at);
  const privacyAccepted = Boolean(data?.privacy_accepted_at);
  return {
    termsAccepted,
    privacyAccepted,
    accepted: termsAccepted && privacyAccepted,
  };
}

export async function acceptUserLegalTerms(): Promise<void> {
  const { error } = await supabase.rpc('accept_user_legal_terms');
  if (error) {
    throw new Error(error.message || 'Could not save legal acceptance');
  }
}
