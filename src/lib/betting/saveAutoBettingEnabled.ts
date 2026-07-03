import { supabase } from '../supabase';
import { getAuthUserId } from '../userWallets';

const ARBITRUM_CHAIN_ID = 42161;

export async function loadAutoBettingEnabled(walletAddress: string): Promise<boolean> {
  const wallet = walletAddress.trim().toLowerCase();
  if (!wallet) return false;
  const { data } = await supabase
    .from('vault_settings')
    .select('auto_betting_enabled')
    .eq('wallet_address', wallet)
    .eq('chain_id', ARBITRUM_CHAIN_ID)
    .maybeSingle();
  return Boolean(data?.auto_betting_enabled);
}

export async function saveAutoBettingEnabled(
  walletAddress: string,
  enabled: boolean
): Promise<void> {
  const wallet = walletAddress.trim().toLowerCase();
  if (!wallet) throw new Error('Wallet required');

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Sign in to change auto-betting settings');

  const { error } = await supabase.from('vault_settings').upsert(
    {
      wallet_address: wallet,
      chain_id: ARBITRUM_CHAIN_ID,
      user_id: userId,
      auto_betting_enabled: enabled,
      updated_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address,chain_id' }
  );
  if (error) throw new Error(error.message);
}
