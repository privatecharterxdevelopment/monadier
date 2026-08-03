import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { normalizeUsernameInput, validateUsername } from './username';

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

/** Create profile row if trigger missed (OAuth / legacy orphans). */
export async function ensureUserProfile(user: User): Promise<void> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (existing?.id) return;

  // Prefer SECURITY DEFINER RPC (works even without INSERT grant)
  const { error: rpcError } = await supabase.rpc('ensure_own_profile');
  if (!rpcError) {
    const { data: afterRpc } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (afterRpc?.id) return;
  }

  const meta = user.user_metadata ?? {};
  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: (meta.full_name as string) || (meta.name as string) || '',
      country: (meta.country as string) || '',
      username: meta.username ? normalizeUsernameInput(String(meta.username)) : null,
    },
    { onConflict: 'id' }
  );

  if (error) {
    const code = String((error as { code?: string }).code ?? '');
    if (
      code === '23505' ||
      error.message.includes('duplicate') ||
      error.message.includes('unique constraint') ||
      error.message.includes('409')
    ) {
      return;
    }
    // RPC missing on older envs — surface original insert error
    if (rpcError) {
      console.warn('[ensureUserProfile] rpc failed', rpcError.message);
    }
    throw error;
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
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Profile update failed');
  if (!data) throw new Error('Profile not found. Sign out and sign in again.');
  return data as ProfileRow;
}
