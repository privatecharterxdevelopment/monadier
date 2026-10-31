import { supabase } from './supabase';
import { getAuthUserId } from './userWallets';
import { fetchBotApi } from './botApiFetch';
import { devError } from './devLog';

export const MAX_HL_FOLLOWS = 15;

export type HlFollowedTrader = {
  id: string;
  wallet: string;
  displayName: string | null;
  createdAt: string;
};

export type HlTraderSearchHit = {
  wallet: string;
  displayName: string | null;
  accountValueUsd: number | null;
};

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

export function isHlFollowWallet(addr: string): boolean {
  return WALLET_RE.test(addr.trim());
}

export function truncateHlWallet(w: string): string {
  const n = w.toLowerCase();
  if (n.length < 12) return n;
  return `${n.slice(0, 6)}…${n.slice(-4)}`;
}

export function hypurrScanAddressUrl(wallet: string): string {
  return `https://hypurrscan.io/address/${wallet.toLowerCase()}`;
}

export async function fetchHlFollowedTraders(): Promise<HlFollowedTrader[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('hl_followed_traders')
    .select('id, wallet_address, display_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    devError('[fetchHlFollowedTraders]', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    wallet: String(row.wallet_address).toLowerCase(),
    displayName: row.display_name != null ? String(row.display_name) : null,
    createdAt: String(row.created_at),
  }));
}

export async function addHlFollowedTrader(params: {
  wallet: string;
  displayName?: string | null;
}): Promise<HlFollowedTrader> {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Sign in to follow a trader');

  const wallet = params.wallet.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    throw new Error('Invalid Hyperliquid address');
  }

  const { data, error } = await supabase
    .from('hl_followed_traders')
    .insert({
      user_id: userId,
      wallet_address: wallet,
      display_name: params.displayName?.trim() || null,
    })
    .select('id, wallet_address, display_name, created_at')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Already following');
    if (error.message?.includes('follow_limit') || error.code === 'P0001') {
      throw new Error(`Limit is ${MAX_HL_FOLLOWS} traders`);
    }
    throw new Error(error.message || 'Could not add trader');
  }

  return {
    id: String(data.id),
    wallet: String(data.wallet_address).toLowerCase(),
    displayName: data.display_name != null ? String(data.display_name) : null,
    createdAt: String(data.created_at),
  };
}

export async function removeHlFollowedTrader(id: string): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('hl_followed_traders')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message || 'Could not remove trader');
}

export async function searchHlTraders(query: string): Promise<HlTraderSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const res = await fetchBotApi(`/api/hl-trader-search?q=${encodeURIComponent(q)}`, {
    retries: 1,
    timeoutMs: 18_000,
  });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; results?: HlTraderSearchHit[]; error?: string }
    | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || 'Search failed');
  }
  return Array.isArray(json.results) ? json.results : [];
}
