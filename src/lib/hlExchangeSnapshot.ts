import type { HlOpenOrder, HlPosition } from './hyperliquid/user';
import { livePositionUpnl } from './hyperliquid/user';
import { filterHlPositions } from './hyperliquid/splitHlPositions';
import { toNum } from './hyperliquid/parse';

export const HL_POSITION_STALE_MS = 5_000;
export const HL_MARK_STALE_MS = 15_000;

export type HlExchangeSnapshot = {
  wallet: string;
  positions: HlPosition[];
  marks: Record<string, number>;
  upnlByCoin: Record<string, number>;
  upnlTotalUsd: number;
  openOrders: HlOpenOrder[];
  positionsAsOfMs: number;
  marksAsOfMs: number;
  marksWsLive: boolean;
  marksStale: boolean;
  positionsStale: boolean;
  stale: boolean;
  positionAgeMs: number;
  markAgeMs: number;
};

export function buildHlExchangeSnapshot(opts: {
  wallet: string;
  positions: HlPosition[];
  marks: Record<string, number>;
  openOrders: HlOpenOrder[];
  positionsAsOfMs: number;
  marksAsOfMs: number;
  marksWsLive: boolean;
  nowMs?: number;
}): HlExchangeSnapshot {
  const now = opts.nowMs ?? Date.now();
  const upnlByCoin: Record<string, number> = {};
  let upnlTotalUsd = 0;
  for (const p of opts.positions) {
    const coin = p.coin;
    const v = livePositionUpnl(p, opts.marks[coin] ?? 0);
    upnlByCoin[coin] = v;
    upnlTotalUsd += v;
  }
  const positionAgeMs = Math.max(0, now - opts.positionsAsOfMs);
  const markAgeMs = Math.max(0, now - opts.marksAsOfMs);
  const positionsStale = positionAgeMs > HL_POSITION_STALE_MS;
  const marksStale =
    markAgeMs > HL_MARK_STALE_MS || (!opts.marksWsLive && markAgeMs > HL_POSITION_STALE_MS);
  return {
    wallet: opts.wallet.toLowerCase(),
    positions: opts.positions,
    marks: opts.marks,
    upnlByCoin,
    upnlTotalUsd,
    openOrders: opts.openOrders,
    positionsAsOfMs: opts.positionsAsOfMs,
    marksAsOfMs: opts.marksAsOfMs,
    marksWsLive: opts.marksWsLive,
    marksStale,
    positionsStale,
    stale: positionsStale || marksStale,
    positionAgeMs,
    markAgeMs,
  };
}

/** Header / dock / footer must agree when fed the same snapshot + scope. */
export function assertSnapshotUpnlAligned(
  snapshot: HlExchangeSnapshot,
  botManagedCoins: ReadonlySet<string>,
  scope: 'bot' | 'manual'
): { totalUsd: number; positionCount: number } {
  const scoped = snapshotScopedUpnl(snapshot, botManagedCoins, scope);
  const walletTotal = snapshot.upnlTotalUsd;
  const scopedSum = scoped.positions.reduce((s, p) => s + (snapshot.upnlByCoin[p.coin] ?? 0), 0);
  if (Math.abs(scoped.totalUsd - scopedSum) > 1e-6) {
    throw new Error('scoped uPnL internal mismatch');
  }
  return { totalUsd: scoped.totalUsd, positionCount: scoped.positions.length };
}

export function snapshotScopedUpnl(
  snapshot: HlExchangeSnapshot,
  botManagedCoins: ReadonlySet<string>,
  scope: 'bot' | 'manual'
): { totalUsd: number; byCoin: Record<string, number>; positions: HlPosition[] } {
  const positions = filterHlPositions(snapshot.positions, botManagedCoins, scope);
  const byCoin: Record<string, number> = {};
  let totalUsd = 0;
  for (const p of positions) {
    const v = snapshot.upnlByCoin[p.coin] ?? livePositionUpnl(p, snapshot.marks[p.coin] ?? 0);
    byCoin[p.coin] = v;
    totalUsd += v;
  }
  return { totalUsd, byCoin, positions };
}
