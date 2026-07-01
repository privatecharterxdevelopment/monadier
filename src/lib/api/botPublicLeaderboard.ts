import { supabase } from '../supabaseClient';
import { hlTxExplorerUrl, hlWalletExplorerUrl } from '../hyperliquid/hlApp';

export type BotPublicTradeRow = {
  id: string;
  wallet: string;
  walletLabel: string;
  pair: string;
  direction: string;
  profitUsd: number;
  closedAt: string;
  verifyUrl: string;
  isLive: boolean;
};

function shortWallet(wallet: string): string {
  const w = wallet.trim();
  if (w.length < 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

function mapRow(row: Record<string, unknown>): BotPublicTradeRow | null {
  const profit = Number(row.profit_loss);
  if (!Number.isFinite(profit)) return null;

  const wallet = String(row.wallet_address ?? '').trim();
  if (!wallet) return null;

  const exitTx = typeof row.exit_tx_hash === 'string' ? row.exit_tx_hash.trim() : '';
  const verifyUrl = exitTx ? hlTxExplorerUrl(exitTx) : hlWalletExplorerUrl(wallet);
  const closedAt = String(row.closed_at ?? row.created_at ?? '');
  const closedMs = closedAt ? Date.parse(closedAt) : 0;
  const isLive = closedMs > 0 && Date.now() - closedMs < 45 * 60 * 1000;

  return {
    id: String(row.id),
    wallet,
    walletLabel: shortWallet(wallet),
    pair: String(row.token_symbol ?? '—'),
    direction: String(row.direction ?? 'LONG'),
    profitUsd: profit,
    closedAt,
    verifyUrl,
    isLive,
  };
}

/** Public HL wins for marketing leaderboard — anon read on trade_history. */
export async function fetchBotPublicLeaderboard(limit = 10): Promise<BotPublicTradeRow[]> {
  const { data, error } = await supabase
    .from('trade_history')
    .select(
      'id, wallet_address, token_symbol, direction, profit_loss, closed_at, created_at, exit_tx_hash, execution_venue'
    )
    .not('closed_at', 'is', null)
    .gt('profit_loss', 0)
    .or('execution_venue.eq.hyperliquid,execution_venue.is.null')
    .order('profit_loss', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[botPublicLeaderboard]', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((row): row is BotPublicTradeRow => row != null);
}

/** Recent profitable closes — live activity strip. */
export async function fetchBotPublicLiveWins(limit = 8): Promise<BotPublicTradeRow[]> {
  const { data, error } = await supabase
    .from('trade_history')
    .select(
      'id, wallet_address, token_symbol, direction, profit_loss, closed_at, created_at, exit_tx_hash, execution_venue'
    )
    .not('closed_at', 'is', null)
    .gt('profit_loss', 0)
    .or('execution_venue.eq.hyperliquid,execution_venue.is.null')
    .order('closed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[botPublicLiveWins]', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((row): row is BotPublicTradeRow => row != null);
}
