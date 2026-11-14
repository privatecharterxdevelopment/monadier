import { config } from '../config';
import { getAutoNewEntriesBlockReason } from './liveDirectionProfile';
import {
  evaluateWalletReentry,
  resolveWalletLastBotCloseMs,
} from './hlCoinCloseGuard';
import {
  blockNewEntriesUntilReconciled,
  getWalletProtectiveReconcileStatus,
} from './hlProtectiveReconcile';

/** Primary reason new entries are blocked — shown in bot-status and lastOpenError. */
export async function resolveHlEntryBlockReason(wallet: string): Promise<string | null> {
  const w = wallet.toLowerCase();

  const autoRegime = getAutoNewEntriesBlockReason();
  if (autoRegime) {
    return `BTC regime gate — new entries paused (${autoRegime})`;
  }

  if (blockNewEntriesUntilReconciled(w)) {
    const prot = getWalletProtectiveReconcileStatus(w);
  const reason = prot?.reason ?? 'protective stops not reconciled';
    return `Emergency SL reconcile — ${reason} (no new opens until fixed)`;
  }

  const cooldownMs = config.hyperliquid.reentryCooldownMs;
  if (cooldownMs > 0) {
    const lastBotClose = await resolveWalletLastBotCloseMs(w);
    const gate = evaluateWalletReentry(lastBotClose);
    if (gate.blocked && gate.reason) {
      const waitMin = Math.max(1, Math.ceil(gate.waitMs / 60_000));
      return `Wallet re-entry pause — ~${waitMin}m left (HL_REENTRY_COOLDOWN_MS is set on the server).`;
    }
  }

  return null;
}