import { supabase } from './supabase';
import { explorerTxUrl } from './tradeExplorer';

export type ClosedTradeRow = {
  id: string;
  positionId: string | null;
  walletAddress: string;
  chainId: number;
  tokenSymbol: string;
  direction: string;
  leverage: number;
  entryAmount: number;
  profitLoss: number;
  profitLossPercent: number | null;
  closedAt: string;
  exitTxHash: string | null;
  closeReason: string | null;
};

function mapFromTradeHistory(row: Record<string, unknown>): ClosedTradeRow {
  return {
    id: String(row.id),
    positionId: row.position_id ? String(row.position_id) : null,
    walletAddress: String(row.wallet_address),
    chainId: Number(row.chain_id) || 42161,
    tokenSymbol: String(row.token_symbol),
    direction: String(row.direction || 'LONG'),
    leverage: Number(row.leverage) || 1,
    entryAmount: Number(row.entry_amount) || 0,
    profitLoss: Number(row.profit_loss) || 0,
    profitLossPercent:
      row.profit_loss_percent != null ? Number(row.profit_loss_percent) : null,
    closedAt: String(row.closed_at || row.created_at),
    exitTxHash: row.exit_tx_hash ? String(row.exit_tx_hash) : null,
    closeReason: row.close_reason ? String(row.close_reason) : null,
  };
}

function mapFromPosition(row: Record<string, unknown>): ClosedTradeRow {
  return {
    id: String(row.id),
    positionId: String(row.id),
    walletAddress: String(row.wallet_address),
    chainId: Number(row.chain_id) || 42161,
    tokenSymbol: String(row.token_symbol),
    direction: String(row.direction || 'LONG'),
    leverage: Number(row.leverage_multiplier) || 1,
    entryAmount: Number(row.entry_amount) || 0,
    profitLoss: Number(row.profit_loss) || 0,
    profitLossPercent:
      row.profit_loss_percent != null ? Number(row.profit_loss_percent) : null,
    closedAt: String(row.closed_at || row.updated_at),
    exitTxHash: row.exit_tx_hash ? String(row.exit_tx_hash) : null,
    closeReason: row.close_reason ? String(row.close_reason) : null,
  };
}

function rowKey(row: ClosedTradeRow): string {
  return row.positionId || row.id;
}

export async function fetchClosedTradesForWallets(
  wallets: string[],
  limit = 100
): Promise<ClosedTradeRow[]> {
  if (wallets.length === 0) return [];

  const normalized = wallets.map((w) => w.toLowerCase());

  const [historyRes, positionsRes] = await Promise.all([
    supabase
      .from('trade_history')
      .select(
        'id, position_id, wallet_address, chain_id, token_symbol, direction, leverage, entry_amount, profit_loss, profit_loss_percent, closed_at, exit_tx_hash, close_reason, created_at'
      )
      .in('wallet_address', normalized)
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(limit),
    supabase
      .from('positions')
      .select(
        'id, wallet_address, chain_id, token_symbol, direction, entry_amount, profit_loss, profit_loss_percent, leverage_multiplier, closed_at, exit_tx_hash, close_reason, updated_at'
      )
      .in('wallet_address', normalized)
      .eq('status', 'closed')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(limit),
  ]);

  const merged = new Map<string, ClosedTradeRow>();

  for (const row of historyRes.data ?? []) {
    const mapped = mapFromTradeHistory(row as Record<string, unknown>);
    merged.set(rowKey(mapped), mapped);
  }

  for (const row of positionsRes.data ?? []) {
    const mapped = mapFromPosition(row as Record<string, unknown>);
    const key = rowKey(mapped);
    if (!merged.has(key)) {
      merged.set(key, mapped);
    }
  }

  return Array.from(merged.values())
    .sort(
      (a, b) =>
        new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
    )
    .slice(0, limit);
}

export function verifyUrlForTrade(trade: ClosedTradeRow): string | null {
  if (trade.exitTxHash) {
    return explorerTxUrl(trade.chainId, trade.exitTxHash);
  }
  return null;
}

export function storageKeyForUser(userId: string | undefined, isDemoUser: boolean) {
  if (isDemoUser) return 'monadier_trade_notif_seen_demo';
  return userId ? `monadier_trade_notif_seen_${userId}` : 'monadier_trade_notif_seen_guest';
}

export function loadLastSeenAt(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveLastSeenAt(key: string, iso: string) {
  try {
    localStorage.setItem(key, iso);
  } catch {
    /* ignore */
  }
}

export function isTradeUnread(trade: ClosedTradeRow, lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return true;
  return new Date(trade.closedAt).getTime() > new Date(lastSeenAt).getTime();
}
