export type HlBettingPositionRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  outcome_id: number;
  side: number;
  side_label: string;
  market_name: string;
  category: string | null;
  balance_coin: string;
  size: number;
  entry_px: number;
  entry_ntl: number;
  mark_px: number | null;
  unrealized_pnl: number | null;
  opened_at: string;
  updated_at: string;
  open_reason: string | null;
  leg_kind: string | null;
  source: string | null;
};

export type HlBettingCloseRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  outcome_id: number;
  side: number;
  side_label: string;
  market_name: string;
  category: string | null;
  size: number;
  exit_px: number;
  realized_pnl: number;
  fee: number;
  hl_fill_tid: number | null;
  closed_at: string;
  created_at: string;
  open_reason: string | null;
  leg_kind: string | null;
  source: string | null;
};

function readNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mapBettingPositionRow(raw: Record<string, unknown>): HlBettingPositionRow {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    wallet_address: String(raw.wallet_address),
    outcome_id: readNum(raw.outcome_id),
    side: readNum(raw.side),
    side_label: String(raw.side_label ?? ''),
    market_name: String(raw.market_name ?? ''),
    category: raw.category != null ? String(raw.category) : null,
    balance_coin: String(raw.balance_coin ?? ''),
    size: readNum(raw.size),
    entry_px: readNum(raw.entry_px),
    entry_ntl: readNum(raw.entry_ntl),
    mark_px: raw.mark_px != null ? readNum(raw.mark_px) : null,
    unrealized_pnl: raw.unrealized_pnl != null ? readNum(raw.unrealized_pnl) : null,
    opened_at: String(raw.opened_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
    open_reason: raw.open_reason != null ? String(raw.open_reason) : null,
    leg_kind: raw.leg_kind != null ? String(raw.leg_kind) : null,
    source: raw.source != null ? String(raw.source) : null,
  };
}

export function mapBettingCloseRow(raw: Record<string, unknown>): HlBettingCloseRow {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    wallet_address: String(raw.wallet_address),
    outcome_id: readNum(raw.outcome_id),
    side: readNum(raw.side),
    side_label: String(raw.side_label ?? ''),
    market_name: String(raw.market_name ?? ''),
    category: raw.category != null ? String(raw.category) : null,
    size: readNum(raw.size),
    exit_px: readNum(raw.exit_px),
    realized_pnl: readNum(raw.realized_pnl),
    fee: readNum(raw.fee),
    hl_fill_tid: raw.hl_fill_tid != null ? readNum(raw.hl_fill_tid) : null,
    closed_at: String(raw.closed_at ?? ''),
    created_at: String(raw.created_at ?? ''),
    open_reason: raw.open_reason != null ? String(raw.open_reason) : null,
    leg_kind: raw.leg_kind != null ? String(raw.leg_kind) : null,
    source: raw.source != null ? String(raw.source) : null,
  };
}
