import { getAutoNewEntriesBlockReason } from './liveDirectionProfile';
import {
  blockNewEntriesUntilReconciled,
  getWalletProtectiveReconcileStatus,
} from './hlProtectiveReconcile';

/** Wallet-specific bot pause — never bear/bull profile (manual trades ignore profile). */
export async function resolveHlEntryBlockReason(wallet: string): Promise<string | null> {
  const w = wallet.toLowerCase();

  const autoRegime = getAutoNewEntriesBlockReason();
  if (autoRegime) {
    return `Auto-bot entries paused — BTC regime (${autoRegime})`;
  }

  if (blockNewEntriesUntilReconciled(w)) {
    const prot = getWalletProtectiveReconcileStatus(w);
  const reason = prot?.reason ?? 'protective stops not reconciled';
    return `Emergency SL reconcile — ${reason} (no new opens until fixed)`;
  }

  return null;
}