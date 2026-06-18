import { supabase } from './supabase';
import { DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';

export type WalletLinkResult =
  | { ok: true }
  | { ok: false; error: string; code?: 'owned_by_other' | 'db_error' | 'not_authenticated' };

const registrationAttempted = new Set<string>();

function registrationKey(userId: string, wallet: string): string {
  return `${userId}:${wallet.toLowerCase()}`;
}

function isWalletUniqueViolation(error: { code?: string; message?: string; status?: number }): boolean {
  return (
    error.code === '23505' ||
    error.status === 409 ||
    Boolean(error.message?.includes('idx_user_wallets_wallet_unique')) ||
    Boolean(error.message?.includes('duplicate key value'))
  );
}

/** Prefer getUser() — getSession() is often empty while AuthContext already has user. */
export async function getAuthUserId(): Promise<string | undefined> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) return user.id;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id;
}

export function normalizeWalletAddresses(wallets: string[]): string[] {
  return [...new Set(wallets.map((w) => w.toLowerCase().trim()).filter(Boolean))];
}

/** True if this wallet is already linked to the current user. */
export async function isWalletOwnedByOtherUser(
  userId: string,
  walletAddress: string
): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();
  const { data: own } = await supabase
    .from('user_wallets')
    .select('id')
    .eq('user_id', userId)
    .eq('wallet_address', wallet)
    .limit(1);

  if (own && own.length > 0) return false;

  // Other users' rows are hidden by RLS — ownership conflicts are handled in linkWalletToUserSafe.
  return false;
}

/** Link wallet to user — refuses if another account already owns it. */
export async function linkWalletToUserSafe(
  userId: string,
  walletAddress: string,
  label?: string
): Promise<WalletLinkResult> {
  const wallet = walletAddress.toLowerCase();
  const key = registrationKey(userId, wallet);

  const { data: ownRow } = await supabase
    .from('user_wallets')
    .select('id')
    .eq('user_id', userId)
    .eq('wallet_address', wallet)
    .limit(1);

  if (ownRow && ownRow.length > 0) {
    registrationAttempted.add(key);
    return { ok: true };
  }

  const { error } = await supabase.from('user_wallets').upsert(
    {
      user_id: userId,
      wallet_address: wallet,
      label: label || `Wallet ${wallet.slice(0, 6)}…${wallet.slice(-4)}`,
    },
    { onConflict: 'user_id,wallet_address' }
  );

  if (error) {
    if (isWalletUniqueViolation(error)) {
      const { data: retryOwn } = await supabase
        .from('user_wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('wallet_address', wallet)
        .limit(1);
      if (retryOwn && retryOwn.length > 0) {
        registrationAttempted.add(key);
        return { ok: true };
      }
      registrationAttempted.add(key);
      return {
        ok: false,
        code: 'owned_by_other',
        error: 'This wallet is already linked to another Monadier account.',
      };
    }
    return { ok: false, code: 'db_error', error: error.message };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_address')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.wallet_address?.trim()) {
    await supabase.from('profiles').update({ wallet_address: wallet }).eq('id', userId);
  }

  registrationAttempted.add(registrationKey(userId, wallet));

  const { error: rpcError } = await supabase.rpc('register_my_wallet', { p_wallet: wallet });
  if (rpcError && !rpcError.message.includes('Could not find the function')) {
    console.warn('[linkWalletToUserSafe] register_my_wallet', rpcError.message);
  }

  return { ok: true };
}

/**
 * Wallets whose positions / trade history the signed-in user may see.
 * Sources: user_wallets, profiles.wallet_address, and the connected wallet when owned by this user.
 */
export async function fetchUserWalletAddresses(
  connectedAddress: string | undefined,
  isDemoUser: boolean
): Promise<string[]> {
  if (isDemoUser) return [DEMO_WALLET_ADDRESS];

  const found = new Set<string>();
  const connected = connectedAddress?.toLowerCase();

  try {
    const userId = await getAuthUserId();
    if (!userId) return connected ? [connected] : [];

    const { data: wallets } = await supabase
      .from('user_wallets')
      .select('wallet_address')
      .eq('user_id', userId);
    wallets?.forEach((w) => found.add(w.wallet_address.toLowerCase()));

    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.wallet_address?.trim()) {
      found.add(profile.wallet_address.toLowerCase());
    }

    if (connected) {
      found.add(connected);
    }
  } catch (err) {
    console.error('[userWallets]', err);
  }

  return Array.from(found);
}

/**
 * Best-effort wallet registration for RLS-linked reads.
 * Uses security-definer RPC (no client upsert spam). Safe to call repeatedly.
 */
export async function registerWalletsForHistory(
  wallets: string[],
  userId?: string
): Promise<void> {
  const unique = normalizeWalletAddresses(wallets);
  if (unique.length === 0) return;

  const uid = userId ?? (await getAuthUserId());
  if (!uid) return;

  for (const w of unique) {
    const key = registrationKey(uid, w);
    if (registrationAttempted.has(key)) continue;
    registrationAttempted.add(key);

    const { error } = await supabase.rpc('register_my_wallet', { p_wallet: w });
    if (!error) continue;
    if (error.message.includes('Could not find the function')) {
      registrationAttempted.delete(key);
      return;
    }
    if (error.message.includes('not authenticated')) {
      registrationAttempted.delete(key);
      return;
    }
  }
}

/** Primary wallet for vault reads — connected if linked, else first profile wallet. */
export function pickPrimaryVaultWallet(
  wallets: string[],
  connectedAddress: string | undefined
): string | undefined {
  const connected = connectedAddress?.toLowerCase();
  if (connected && wallets.includes(connected)) return connected;
  return wallets[0];
}
