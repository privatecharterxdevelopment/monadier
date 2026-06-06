import { supabase } from './supabase';

/** Ensures the signed-in user has a free-tier subscription row (idempotent). */
export async function ensureFreeSubscription(): Promise<void> {
  const { error } = await supabase.rpc('ensure_free_subscription');
  if (error) {
    console.error('[ensureFreeSubscription]', error);
    throw new Error(error.message || 'Could not ensure subscription');
  }
}
