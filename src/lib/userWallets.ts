import { supabase } from './supabase';
import { DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';

/** All wallet addresses whose positions the user may see / close. */
export async function fetchUserWalletAddresses(
  connectedAddress: string | undefined,
  isDemoUser: boolean
): Promise<string[]> {
  if (isDemoUser) return [DEMO_WALLET_ADDRESS];

  const found = new Set<string>();
  if (connectedAddress) {
    found.add(connectedAddress.toLowerCase());
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: wallets } = await supabase
        .from('user_wallets')
        .select('wallet_address')
        .eq('user_id', user.id);
      wallets?.forEach((w) => found.add(w.wallet_address.toLowerCase()));
    }

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_address')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.wallet_address) {
        found.add(profile.wallet_address.toLowerCase());
      }
    }

    if (connectedAddress) {
      const { data: vaultSettings } = await supabase
        .from('vault_settings')
        .select('wallet_address')
        .eq('wallet_address', connectedAddress.toLowerCase());
      vaultSettings?.forEach((v) => found.add(v.wallet_address.toLowerCase()));
    }
  } catch (err) {
    console.error('[userWallets]', err);
  }

  return Array.from(found);
}
