/**
 * Railway-restart reconstruction from Hyperliquid only.
 * Disk `data/hl-profit-trail-state.json` is never required.
 */
import {
  breakevenPlusFeesStopPx,
  estimateRoundTripFeesUsd,
} from './dynamicTrailingStop';
import {
  planProtectiveSync,
  type FrontendOrder,
  type ProtectiveSyncPlan,
} from './hlProfitStopSync';

export type ReconcilePosition = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  markPx: number;
  absSize: number;
  upnlUsd: number;
  desiredStopPx: number | null;
  armed: boolean;
  emergencyStopPx: number | null;
  tickSize: number;
};

export type WalletProtectiveReconcile = {
  ok: boolean;
  reason: string;
  blockNewEntries: boolean;
  positions: number;
  coins: Array<ProtectiveSyncPlan & { coin: string; neverLoosened: boolean }>;
};

const walletStatus = new Map<string, { ok: boolean; reason: string; at: number }>();

export function isWalletProtectiveReconciled(wallet: string): boolean {
  return walletStatus.get(wallet.toLowerCase())?.ok === true;
}

export function blockNewEntriesUntilReconciled(wallet: string): boolean {
  const row = walletStatus.get(wallet.toLowerCase());
  if (!row) return true;
  return !row.ok;
}

export function markWalletProtectiveReconcile(
  wallet: string,
  ok: boolean,
  reason: string,
  at = Date.now()
): void {
  walletStatus.set(wallet.toLowerCase(), { ok, reason, at });
}

export function resetProtectiveReconcileForTests(): void {
  walletStatus.clear();
}

export function reconcileProtectiveFromSnapshot(opts: {
  wallet: string;
  positions: ReconcilePosition[];
  orders: FrontendOrder[] | null;
  nowMs: number;
  /** Restart: in-memory trail is empty. Must not be used as the floor. */
  memoryStops?: Record<string, number | null>;
}): WalletProtectiveReconcile {
  if (opts.orders == null) {
    const result: WalletProtectiveReconcile = {
      ok: false,
      reason: 'frontendOpenOrders unreachable',
      blockNewEntries: true,
      positions: opts.positions.length,
      coins: [],
    };
    markWalletProtectiveReconcile(opts.wallet, false, result.reason, opts.nowMs);
    return result;
  }

  const coins: WalletProtectiveReconcile['coins'] = [];
  let emergencyUnprotected = false;

  for (const pos of opts.positions) {
    const notional = pos.absSize * pos.markPx;
    const feesUsd = estimateRoundTripFeesUsd(notional);
    const be = breakevenPlusFeesStopPx(
      pos.direction,
      pos.entryPx,
      pos.absSize,
      feesUsd,
      0,
      notional,
      pos.tickSize
    );
    void opts.memoryStops?.[pos.coin];
    const plan = planProtectiveSync({
      direction: pos.direction,
      entryPx: pos.entryPx,
      markPx: pos.markPx,
      absSize: pos.absSize,
      orders: opts.orders,
      coin: pos.coin,
      desiredStopPx: pos.desiredStopPx,
      armed: pos.armed || pos.upnlUsd > 0,
      emergencyStopPx: pos.emergencyStopPx,
      minLockUsd: 0,
      tickSize: pos.tickSize,
      breakevenPx: be,
      nowMs: opts.nowMs,
      lastTrailSyncAt: 0,
    });
    const neverLoosened =
      plan.reconstructedProfitPx == null ||
      plan.mergedProfitPx == null ||
      (pos.direction === 'LONG'
        ? plan.mergedProfitPx + 1e-12 >= plan.reconstructedProfitPx
        : plan.mergedProfitPx - 1e-12 <= plan.reconstructedProfitPx);
    if (plan.emergencyMissing) emergencyUnprotected = true;
    coins.push({ ...plan, coin: pos.coin, neverLoosened });
  }

  const ok = !emergencyUnprotected;
  const reason = ok
    ? 'exchange protective stops reconciled'
    : 'emergency SL missing — restore before new entries';
  const result: WalletProtectiveReconcile = {
    ok,
    reason,
    blockNewEntries: !ok,
    positions: opts.positions.length,
    coins,
  };
  markWalletProtectiveReconcile(opts.wallet, ok, reason, opts.nowMs);
  return result;
}
