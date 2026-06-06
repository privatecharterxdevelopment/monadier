import { supabase } from './supabase';
import { DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';

export type WalletLinkResult =
  | { ok: true }
  | { ok: false; error: string; code?: 'owned_by_other' | 'db_error' };

/** True if this wallet is linked to a different auth user. */
export async function isWalletOwnedByOtherUser(
  userId: string,
  walletAddress: string
): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from('user_wallets')
    .select('user_id')
    .eq('wallet_address', wallet)
    .limit(1);

  if (error) {
    console.error('[userWallets] ownership check', error);
    return false;
  }

  const row = data?.[0];
  return Boolean(row && row.user_id !== userId);
}

/** Link wallet to user — refuses if another account already owns it. */
export async function linkWalletToUserSafe(
  userId: string,
  walletAddress: string,
  label?: string
): Promise<WalletLinkResult> {
  const wallet = walletAddress.toLowerCase();

  if (await isWalletOwnedByOtherUser(userId, wallet)) {
    return {
      ok: false,
      code: 'owned_by_other',
      error: 'This wallet is already linked to another Monadier account.',
    };
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
    return { ok: false, code: 'db_error', error: error.message };
  }

  return { ok: true };
}

/**
 * Wallets whose positions the signed-in user may see.
 * Only DB-linked wallets — never the raw MetaMask address alone.
 */
export async function fetchUserWalletAddresses(
  _connectedAddress: string | undefined,
  isDemoUser: boolean
): Promise<string[]> {
  if (isDemoUser) return [DEMO_WALLET_ADDRESS];

  const found = new Set<string>();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: wallets } = await supabase
      .from('user_wallets')
      .select('wallet_address')
      .eq('user_id', user.id);
    wallets?.forEach((w) => found.add(w.wallet_address.toLowerCase()));

    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.wallet_address?.trim()) {
      found.add(profile.wallet_address.toLowerCase());
    }
  } catch (err) {
    console.error('[userWallets]', err);
  }

  return Array.from(found);
}
