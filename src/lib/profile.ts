import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { normalizeUsernameInput, validateUsername } from './username';
import { REGISTRATION_CLOSED, registrationClosedError } from './productShutdown';

export type ProfileRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  country?: string | null;
  avatar_url?: string | null;
  avatar_emoji?: string | null;
  wallet_address?: string | null;
  [key: string]: unknown;
};

/**
 * Guarantees a public.profiles row for this auth user.
 * Google / email / returning sessions all go through here.
 * Uses SECURITY DEFINER RPC first — never optional.
 */
export async function ensureUserProfile(user: User): Promise<void> {
  if (!user?.id) throw new Error('No auth user — cannot create profile');

  if (REGISTRATION_CLOSED) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!existing?.id) {
      await supabase.auth.signOut().catch(() => undefined);
      throw registrationClosedError();
    }
  }

  const { error: rpcError } = await supabase.rpc('ensure_own_profile');

  if (rpcError) {
    const meta = user.user_metadata ?? {};
    const { error: upsertError } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name: (meta.full_name as string) || (meta.name as string) || '',
        country: (meta.country as string) || '',
        username: meta.username ? normalizeUsernameInput(String(meta.username)) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (upsertError) {
      throw new Error(
        `Profile create failed (rpc: ${rpcError.message}; upsert: ${upsertError.message})`
      );
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, username, country, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Profile verify failed: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error('Profile row missing after ensure_own_profile — signup incomplete');
  }
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const err = validateUsername(username);
  if (err) return false;

  const { data, error } = await supabase.rpc('is_username_available', {
    p_username: normalizeUsernameInput(username),
  });

  if (error) {
    console.error('[isUsernameAvailable]', error);
    throw new Error(error.message || 'Could not check username');
  }

  return Boolean(data);
}

export async function setUsernameOnce(username: string): Promise<string> {
  const validation = validateUsername(username);
  if (validation) throw new Error(validation);

  const { data, error } = await supabase.rpc('set_username_once', {
    p_username: normalizeUsernameInput(username),
  });

  if (error) throw new Error(error.message || 'Could not set username');

  const row = data as { success?: boolean; error?: string; username?: string };
  if (!row?.success) {
    throw new Error(row?.error || 'Could not set username');
  }

  return row.username || normalizeUsernameInput(username);
}

export async function patchUserProfile(
  userId: string,
  updates: Record<string, unknown>
): Promise<ProfileRow> {
  const allowedKeys = new Set([
    'full_name',
    'country',
    'avatar_url',
    'avatar_emoji',
    'wallet_address',
    'trade_close_email_enabled',
    'community_mention_email_enabled',
    'follow_trader_email_enabled',
  ]);

  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowedKeys.has(key))
  );

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...safeUpdates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Profile update failed');
  if (!data) throw new Error('Profile not found. Sign out and sign in again.');
  return data as ProfileRow;
}
