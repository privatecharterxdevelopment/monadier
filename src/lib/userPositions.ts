import { supabase } from './supabase';
import { DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import {
  fetchUserWalletAddresses,
  getAuthUserId,
  normalizeWalletAddresses,
  registerWalletsForHistory,
} from './userWallets';

export type UserPositionRow = {
  id: string;
  wallet_address: string;
  chain_id: number;
  token_symbol: string;
  token_address?: string;
  direction: string;
  entry_price: number;
  entry_amount: number;
  status: string;
  highest_price: number | null;
  profit_loss: number | null;
  leverage_multiplier: number | null;
  closed_at: string | null;
  created_at: string;
  updated_at?: string;
  close_reason?: string | null;
  exit_tx_hash?: string | null;
  entry_tx_hash?: string | null;
};

type FetchUserPositionsOptions = {
  wallets?: string[];
  isDemoUser?: boolean;
  connectedAddress?: string;
  userId?: string;
  limit?: number;
};

const POSITION_SELECT =
  'id, wallet_address, chain_id, token_symbol, token_address, direction, entry_price, entry_amount, status, highest_price, profit_loss, leverage_multiplier, closed_at, created_at, updated_at, close_reason, exit_tx_hash, entry_tx_hash';

async function queryPositionsDirect(
  walletArray: string[],
  limit: number
): Promise<UserPositionRow[]> {
  if (walletArray.length === 0) return [];

  const { data, error } = await supabase
    .from('positions')
    .select(POSITION_SELECT)
    .in('wallet_address', walletArray)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[fetchUserPositions] direct', error);
    return [];
  }

  return (data as UserPositionRow[]) || [];
}

/** Load positions for linked wallets (registers wallets + RPC when signed in). */
export async function fetchUserPositions(
  options: FetchUserPositionsOptions = {}
): Promise<UserPositionRow[]> {
  const limit = Math.min(options.limit ?? 500, 500);
  const isDemoUser = Boolean(options.isDemoUser);

  let walletArray = normalizeWalletAddresses(options.wallets ?? []);

  if (walletArray.length === 0 && !isDemoUser) {
    walletArray = normalizeWalletAddresses(
      await fetchUserWalletAddresses(options.connectedAddress, false)
    );
    const connected = options.connectedAddress?.toLowerCase();
    if (connected && !walletArray.includes(connected)) {
      walletArray.push(connected);
    }
  }

  if (isDemoUser) {
    walletArray = [(walletArray[0] ?? DEMO_WALLET_ADDRESS).toLowerCase()];
    return queryPositionsDirect(walletArray, limit);
  }

  const userId = options.userId ?? (await getAuthUserId());
  if (!userId) {
    return walletArray.length > 0 ? queryPositionsDirect(walletArray, limit) : [];
  }

  if (walletArray.length > 0) {
    await registerWalletsForHistory(walletArray, userId);
  }

  if (walletArray.length > 0) {
    const sync = await supabase.rpc('sync_wallets_and_get_positions', {
      p_wallets: walletArray,
      p_limit: limit,
    });
    if (!sync.error && sync.data && (sync.data as UserPositionRow[]).length > 0) {
      return sync.data as UserPositionRow[];
    }
    if (sync.error && !sync.error.message?.includes('Could not find the function')) {
      console.error('[fetchUserPositions] sync rpc', sync.error);
    }
  }

  const legacy = await supabase.rpc('get_my_positions_history', { p_limit: limit });
  if (!legacy.error && legacy.data && (legacy.data as UserPositionRow[]).length > 0) {
    return legacy.data as UserPositionRow[];
  }

  return queryPositionsDirect(walletArray, limit);
}
