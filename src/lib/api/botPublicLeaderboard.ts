import { supabase } from '../supabaseClient';
import { hlTxExplorerUrl, hlWalletExplorerUrl } from '../hyperliquid/hlApp';

export type BotPublicTradeRow = {
  id: string;
  wallet: string;
  walletLabel: string;
  pair: string;
  direction: string;
  profitUsd: number;
  openedAt: string | null;
  closedAt: string;
  verifyUrl: string;
  isLive: boolean;
};

type RpcRow = {
  id: string;
  wallet_address: string;
  wallet_label: string;
  token_symbol: string;
  direction: string;
  profit_usd: number | string;
  opened_at: string | null;
  closed_at: string;
  exit_tx_hash: string | null;
};

function mapRow(row: RpcRow): BotPublicTradeRow | null {
  const profit = Number(row.profit_usd);
  if (!Number.isFinite(profit)) return null;

  const wallet = String(row.wallet_address ?? '').trim().toLowerCase();
  if (!wallet) return null;

  const exitTx = row.exit_tx_hash?.trim() ?? '';
  const verifyUrl = exitTx ? hlTxExplorerUrl(exitTx) : hlWalletExplorerUrl(wallet);
  const closedAt = String(row.closed_at ?? '');
  const closedMs = closedAt ? Date.parse(closedAt) : 0;
  const isLive = closedMs > 0 && Date.now() - closedMs < 45 * 60 * 1000;

  return {
    id: String(row.id),
    wallet,
    walletLabel: String(row.wallet_label ?? wallet),
    pair: String(row.token_symbol ?? '—'),
    direction: String(row.direction ?? 'LONG'),
    profitUsd: profit,
    openedAt: row.opened_at ?? null,
    closedAt,
    verifyUrl,
    isLive,
  };
}

async function fetchViaRpc(
  sort: 'top' | 'recent',
  limit: number
): Promise<BotPublicTradeRow[]> {
  const { data, error } = await supabase.rpc('get_public_bot_leaderboard', {
    p_sort: sort,
    p_limit: limit,
  });

  if (error) {
    console.warn('[botPublicLeaderboard]', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => mapRow(row as RpcRow))
    .filter((row): row is BotPublicTradeRow => row != null);
}

/** Public HL wins — top by profit (RPC, anon-safe). */
export async function fetchBotPublicLeaderboard(limit = 10): Promise<BotPublicTradeRow[]> {
  return fetchViaRpc('top', limit);
}

/** Recent profitable closes — live activity strip. */
export async function fetchBotPublicLiveWins(limit = 8): Promise<BotPublicTradeRow[]> {
  return fetchViaRpc('recent', limit);
}
