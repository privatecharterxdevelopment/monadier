import { supabase } from './supabase';
import { DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import {
  fetchUserWalletAddresses,
  getAuthUserId,
  normalizeWalletAddresses,
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

function positionSortKey(row: UserPositionRow): number {
  return new Date(row.closed_at || row.created_at).getTime();
}

export function mergePositionRows(
  ...groups: UserPositionRow[][]
): UserPositionRow[] {
  const map = new Map<string, UserPositionRow>();
  for (const group of groups) {
    for (const row of group) {
      map.set(row.id, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => positionSortKey(b) - positionSortKey(a));
}

async function queryPositionsViaPublicRpc(
  walletArray: string[],
  limit: number
): Promise<UserPositionRow[]> {
  if (walletArray.length === 0) return [];

  const { data, error } = await supabase.rpc('get_wallet_position_history', {
    p_wallets: walletArray,
    p_limit: limit,
  });

  if (error) {
    if (!error.message?.includes('Could not find the function')) {
      console.error('[fetchUserPositions] public rpc', error);
    }
    return [];
  }

  return (data as UserPositionRow[]) || [];
}

async function queryAccountPositions(limit: number): Promise<UserPositionRow[]> {
  const { data, error } = await supabase.rpc('get_my_positions_history', { p_limit: limit });
  if (error) {
    if (!error.message?.includes('Could not find the function')) {
      console.error('[fetchUserPositions] account rpc', error);
    }
    return [];
  }
  return (data as UserPositionRow[]) || [];
}

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

/**
 * Load positions for all wallets linked to the signed-in profile (user_wallets + profile),
 * merged with any connected / explicitly passed wallets.
 */
export async function fetchUserPositions(
  options: FetchUserPositionsOptions = {}
): Promise<UserPositionRow[]> {
  const limit = Math.min(options.limit ?? 500, 500);
  const isDemoUser = Boolean(options.isDemoUser);
  const userId = options.userId ?? (await getAuthUserId());

  let walletArray = normalizeWalletAddresses(options.wallets ?? []);

  if (!isDemoUser) {
    const linked = await fetchUserWalletAddresses(options.connectedAddress, false);
    walletArray = normalizeWalletAddresses([...walletArray, ...linked]);
  }

  if (isDemoUser) {
    walletArray = [(walletArray[0] ?? DEMO_WALLET_ADDRESS).toLowerCase()];
    return queryPositionsDirect(walletArray, limit);
  }

  if (!userId && walletArray.length === 0) {
    return [];
  }

  const accountRows = userId ? await queryAccountPositions(limit) : [];
  const publicRows = walletArray.length > 0 ? await queryPositionsViaPublicRpc(walletArray, limit) : [];
  let merged = mergePositionRows(accountRows, publicRows);

  if (merged.length > 0) {
    return merged.slice(0, limit);
  }

  if (userId && walletArray.length > 0) {
    const sync = await supabase.rpc('sync_wallets_and_get_positions', {
      p_wallets: walletArray,
      p_limit: limit,
    });
    if (!sync.error && sync.data) {
      merged = mergePositionRows(merged, sync.data as UserPositionRow[]);
      if (merged.length > 0) return merged.slice(0, limit);
    } else if (sync.error && !sync.error.message?.includes('Could not find the function')) {
      console.error('[fetchUserPositions] sync rpc', sync.error);
    }
  }

  if (walletArray.length > 0) {
    return queryPositionsDirect(walletArray, limit);
  }

  return [];
}
