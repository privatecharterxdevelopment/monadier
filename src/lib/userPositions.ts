import { supabase } from './supabase';
import { DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { fetchUserWalletAddresses, registerWalletsForHistory } from './userWallets';

export type UserPositionRow = {
  id: string;
  wallet_address: string;
  status: string;
  entry_price: number;
  entry_amount: number;
  token_symbol: string;
  direction: string;
  highest_price: number | null;
  profit_loss: number | null;
  leverage_multiplier: number | null;
  closed_at: string | null;
  created_at: string;
  updated_at?: string;
};

type FetchUserPositionsOptions = {
  wallets?: string[];
  isDemoUser?: boolean;
  connectedAddress?: string;
  limit?: number;
};

/** Load positions for linked wallets (registers wallets + RPC when signed in). */
export async function fetchUserPositions(
  options: FetchUserPositionsOptions = {}
): Promise<UserPositionRow[]> {
  const limit = Math.min(options.limit ?? 500, 500);
  const isDemoUser = Boolean(options.isDemoUser);

  let walletArray = (options.wallets ?? []).map((w) => w.toLowerCase()).filter(Boolean);

  if (walletArray.length === 0 && !isDemoUser) {
    walletArray = await fetchUserWalletAddresses(options.connectedAddress, false);
    const connected = options.connectedAddress?.toLowerCase();
    if (connected && !walletArray.includes(connected)) {
      walletArray.push(connected);
    }
  }

  if (isDemoUser) {
    walletArray = [(walletArray[0] ?? DEMO_WALLET_ADDRESS).toLowerCase()];
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session && walletArray.length > 0 && !isDemoUser) {
    await registerWalletsForHistory(walletArray);
  }

  if (session && !isDemoUser) {
    const { data, error } = await supabase.rpc('get_my_positions_history', { p_limit: limit });
    if (!error && data) {
      return (data as UserPositionRow[]) || [];
    }
    if (error && !error.message?.includes('Could not find the function')) {
      console.error('[fetchUserPositions] rpc', error);
    }
  }

  if (!isDemoUser && walletArray.length === 0) {
    return [];
  }

  let query = supabase
    .from('positions')
    .select(
      'id, wallet_address, status, entry_price, entry_amount, token_symbol, direction, highest_price, profit_loss, leverage_multiplier, closed_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (walletArray.length > 0) {
    query = query.in('wallet_address', walletArray);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[fetchUserPositions]', error);
    return [];
  }

  return (data as UserPositionRow[]) || [];
}
