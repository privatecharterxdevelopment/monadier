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

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_address')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.wallet_address?.trim()) {
    await supabase.from('profiles').update({ wallet_address: wallet }).eq('id', userId);
  }

  try {
    await supabase.rpc('register_my_wallet', { p_wallet: wallet });
  } catch {
    /* RPC may not be deployed yet */
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

    if (connected) {
      const ownedByOther = await isWalletOwnedByOtherUser(user.id, connected);
      if (!ownedByOther) {
        found.add(connected);
      }
    }
  } catch (err) {
    console.error('[userWallets]', err);
  }

  return Array.from(found);
}

/** Register wallets with Supabase so RLS + history RPC can see vault trades. */
export async function registerWalletsForHistory(wallets: string[]): Promise<void> {
  const unique = [...new Set(wallets.map((w) => w.toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  for (const w of unique) {
    const linked = await linkWalletToUserSafe(userId, w, 'app-linked');
    if (!linked.ok && linked.code !== 'owned_by_other') {
      console.warn('[registerWalletsForHistory]', w.slice(0, 10), linked.error);
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
