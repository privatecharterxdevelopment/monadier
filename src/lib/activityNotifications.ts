import type { ClosedTradeRow } from './closedTrades';
import { verifyUrlForTrade } from './closedTrades';
import { mapBettingCloseRow, type HlBettingCloseRow } from './betting/types';
import { getAuthUserId } from './userWallets';
import { supabase } from './supabase';
import { devError } from './devLog';

export type ActivityNotificationKind = 'bot' | 'betting';

export type ActivityNotification = {
  id: string;
  kind: ActivityNotificationKind;
  /** Primary line, e.g. "LONG BTC" or market name */
  headline: string;
  /** Secondary line, e.g. side label for bets */
  detail?: string | null;
  profitLoss: number;
  /** ROI on margin (%), when available */
  profitLossPercent?: number | null;
  closedAt: string;
  /** Bot history row highlight */
  highlightId?: string | null;
  verifyUrl?: string | null;
  /** Server-persisted notification row */
  dbId?: string | null;
  readAt?: string | null;
  /** open = AI bet opened; close = settled */
  eventType?: 'open' | 'close' | null;
};

export function botTradeToNotification(row: ClosedTradeRow): ActivityNotification {
  return {
    id: `bot-${row.id}`,
    kind: 'bot',
    headline: `${row.direction} ${row.tokenSymbol}`,
    profitLoss: row.profitLoss,
    profitLossPercent: row.profitLossPercent,
    closedAt: row.closedAt,
    highlightId: row.positionId || row.id,
    verifyUrl: verifyUrlForTrade({
      exitTxHash: row.exitTxHash,
      chainId: row.chainId,
      executionVenue: row.executionVenue,
      walletAddress: row.walletAddress,
    }),
  };
}

export function bettingCloseToNotification(row: HlBettingCloseRow): ActivityNotification {
  return {
    id: `betting-${row.id}`,
    kind: 'betting',
    headline: row.market_name,
    detail: row.side_label,
    profitLoss: row.realized_pnl,
    closedAt: row.closed_at,
    highlightId: row.id,
  };
}

export function mergeActivityNotifications(
  bot: ActivityNotification[],
  betting: ActivityNotification[],
  limit = 100
): ActivityNotification[] {
  const botRows = Array.isArray(bot) ? bot : [];
  const bettingRows = Array.isArray(betting) ? betting : [];
  return [...botRows, ...bettingRows]
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())
    .slice(0, limit);
}

export function isActivityUnread(
  notification: ActivityNotification,
  lastSeenAt: string | null
): boolean {
  if (notification.readAt) return false;
  if (!lastSeenAt) return true;
  return new Date(notification.closedAt).getTime() > new Date(lastSeenAt).getTime();
}

export function toastMessageForNotification(n: ActivityNotification): string {
  const sign = n.profitLoss >= 0 ? '+' : '-';
  const amount = Math.abs(n.profitLoss).toFixed(2);
  const roi =
    n.profitLossPercent != null && Number.isFinite(n.profitLossPercent)
      ? ` · ${n.profitLossPercent >= 0 ? '+' : ''}${n.profitLossPercent.toFixed(2)}% ROI`
      : '';

  if (n.kind === 'betting') {
    if (n.eventType === 'open') {
      const pick = n.detail?.split('\n')[0]?.replace(/^Pick:\s*/i, '') ?? '';
      return pick ? `AI bet opened · ${pick} · ${n.headline}` : `AI bet opened · ${n.headline}`;
    }
    const won = n.profitLoss > 0;
    const lost = n.profitLoss < 0;
    const prefix = won ? 'Bet won' : lost ? 'Bet lost' : 'Bet settled';
    const side = n.detail && !n.detail.includes('\n') ? ` · ${n.detail}` : '';
    return `${prefix}${side} ${sign}$${amount}${roi}`;
  }

  return `Trade closed · ${n.headline} ${sign}$${amount}${roi}`;
}

/** Load recent closed bets for the signed-in user (Supabase RLS). */
export async function fetchBettingCloseNotifications(limit = 50): Promise<HlBettingCloseRow[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('hl_betting_closes')
    .select('*')
    .eq('user_id', userId)
    .order('closed_at', { ascending: false })
    .limit(limit);

  if (error) {
    devError('[fetchBettingCloseNotifications]', error);
    return [];
  }

  return (data ?? []).map((r) => mapBettingCloseRow(r as Record<string, unknown>));
}
