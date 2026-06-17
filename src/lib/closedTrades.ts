import { supabase } from './supabase';
import { DEMO_WALLET_ADDRESS } from '../contexts/AuthContext';
import { explorerTxUrl } from './tradeExplorer';
import { registerWalletsForHistory } from './userWallets';

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

export type HistoryStatus = 'closed' | 'closing' | 'failed';

export type UnifiedHistoryRow = {
  id: string;
  positionId: string | null;
  walletAddress: string;
  chainId: number;
  tokenSymbol: string;
  direction: string;
  leverage: number;
  entryAmount: number;
  profitLoss: number | null;
  closedAt: string;
  exitTxHash: string | null;
  closeReason: string | null;
  status: HistoryStatus;
  source: 'trade_history' | 'position';
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

type FetchOptions = {
  isDemoUser?: boolean;
  wallets?: string[];
  limit?: number;
};

/** Load closed trades — uses Supabase RLS for signed-in users (no brittle wallet filter). */
export async function fetchClosedTradesForWallets(
  wallets: string[],
  limit = 100,
  isDemoUser = false
): Promise<ClosedTradeRow[]> {
  return fetchClosedTrades({ isDemoUser, wallets, limit });
}

/** Load closed trades — registers wallets, then RPC or wallet-scoped queries. */
export async function fetchClosedTrades(options: FetchOptions = {}): Promise<ClosedTradeRow[]> {
  const limit = options.limit ?? 100;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const normalized = (options.wallets ?? []).map((w) => w.toLowerCase()).filter(Boolean);

  if (options.isDemoUser) {
    const demoWallet = (normalized[0] ?? DEMO_WALLET_ADDRESS).toLowerCase();
    return fetchClosedTradesDirect([demoWallet], limit, true);
  }

  if (session && normalized.length > 0) {
    await registerWalletsForHistory(normalized);
  }

  if (session) {
    const rpcRows = await fetchClosedTradesViaRpc(limit);
    if (rpcRows !== null) {
      return rpcRows;
    }
  }

  if (!session && normalized.length === 0) {
    return [];
  }

  return fetchClosedTradesDirect(normalized, limit, false);
}

async function fetchClosedTradesViaRpc(limit: number): Promise<ClosedTradeRow[] | null> {
  const [historyRes, positionsRes] = await Promise.all([
    supabase.rpc('get_my_trade_history', { p_limit: limit }),
    supabase.rpc('get_my_positions_history', { p_limit: limit }),
  ]);

  const rpcMissing = (err: { message?: string } | null) =>
    Boolean(err?.message?.includes('Could not find the function'));

  if (rpcMissing(historyRes.error) || rpcMissing(positionsRes.error)) {
    return null;
  }

  if (historyRes.error) {
    console.error('[fetchClosedTrades] rpc trade_history', historyRes.error);
  }
  if (positionsRes.error) {
    console.error('[fetchClosedTrades] rpc positions', positionsRes.error);
  }

  return mergeClosedTradeRows(
    (historyRes.data ?? []) as Record<string, unknown>[],
    (positionsRes.data ?? []) as Record<string, unknown>[],
    limit
  );
}

async function fetchClosedTradesDirect(
  wallets: string[],
  limit: number,
  isDemoUser: boolean
): Promise<ClosedTradeRow[]> {
  const tradeHistorySelect =
    'id, position_id, wallet_address, chain_id, token_symbol, direction, leverage, entry_amount, profit_loss, profit_loss_percent, closed_at, exit_tx_hash, close_reason, created_at';
  const positionsSelect =
    'id, wallet_address, chain_id, token_symbol, direction, entry_amount, profit_loss, profit_loss_percent, leverage_multiplier, closed_at, exit_tx_hash, close_reason, updated_at, status';

  let historyQuery = supabase
    .from('trade_history')
    .select(tradeHistorySelect)
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(limit);

  let positionsQuery = supabase
    .from('positions')
    .select(positionsSelect)
    .in('status', ['closed', 'failed', 'closing'])
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (wallets.length > 0) {
    historyQuery = historyQuery.in('wallet_address', wallets);
    positionsQuery = positionsQuery.in('wallet_address', wallets);
  } else if (!isDemoUser) {
    return [];
  }

  const [historyRes, positionsRes] = await Promise.all([historyQuery, positionsQuery]);

  if (historyRes.error) {
    console.error('[fetchClosedTrades] trade_history', historyRes.error);
  }
  if (positionsRes.error) {
    console.error('[fetchClosedTrades] positions', positionsRes.error);
  }

  return mergeClosedTradeRows(
    (historyRes.data ?? []) as Record<string, unknown>[],
    (positionsRes.data ?? []) as Record<string, unknown>[],
    limit
  );
}

function mergeClosedTradeRows(
  historyRows: Record<string, unknown>[],
  positionRows: Record<string, unknown>[],
  limit: number
): ClosedTradeRow[] {
  const merged = new Map<string, ClosedTradeRow>();

  for (const row of historyRows) {
    const mapped = mapFromTradeHistory(row);
    merged.set(rowKey(mapped), mapped);
  }

  for (const row of positionRows) {
    const status = String(row.status || '');
    if (status === 'closing') continue;
    if (status !== 'closed' && status !== 'failed') continue;
    const mapped = mapFromPosition(row);
    const key = rowKey(mapped);
    if (!merged.has(key)) {
      merged.set(key, mapped);
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())
    .slice(0, limit);
}

type PositionLike = {
  id: string;
  wallet_address: string;
  chain_id: number;
  token_symbol: string;
  direction: string;
  entry_amount: number;
  profit_loss: number | null;
  leverage_multiplier: number | null;
  status: string;
  closed_at: string | null;
  created_at: string;
  exit_tx_hash: string | null;
  close_reason: string | null;
};

export function mergeUnifiedHistory(
  closedHistory: ClosedTradeRow[],
  positionRows: PositionLike[]
): UnifiedHistoryRow[] {
  const map = new Map<string, UnifiedHistoryRow>();

  for (const t of closedHistory) {
    const key = t.positionId || t.id;
    map.set(key, {
      id: t.id,
      positionId: t.positionId,
      walletAddress: t.walletAddress,
      chainId: t.chainId,
      tokenSymbol: t.tokenSymbol,
      direction: t.direction,
      leverage: t.leverage,
      entryAmount: t.entryAmount,
      profitLoss: t.profitLoss,
      closedAt: t.closedAt,
      exitTxHash: t.exitTxHash,
      closeReason: t.closeReason,
      status: 'closed',
      source: 'trade_history',
    });
  }

  for (const p of positionRows) {
    if (p.status !== 'closed' && p.status !== 'failed' && p.status !== 'closing') continue;
    const key = p.id;
    const existing = map.get(key);
    const closedAt = p.closed_at || p.created_at;
    const status = p.status as HistoryStatus;
    if (existing) {
      if (status === 'closing') {
        map.set(key, { ...existing, status: 'closing', closedAt });
      }
      continue;
    }
    map.set(key, {
      id: p.id,
      positionId: p.id,
      walletAddress: p.wallet_address,
      chainId: p.chain_id || 42161,
      tokenSymbol: p.token_symbol,
      direction: p.direction || 'LONG',
      leverage: p.leverage_multiplier ?? 1,
      entryAmount: p.entry_amount || 0,
      profitLoss: p.profit_loss,
      closedAt,
      exitTxHash: p.exit_tx_hash,
      closeReason: p.close_reason,
      status,
      source: 'position',
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
  );
}

export function verifyUrlForTrade(trade: {
  exitTxHash: string | null;
  chainId: number;
}): string | null {
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
